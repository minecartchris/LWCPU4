; ============================================================
; linux.asm  --  Linux-style shell + tiny filesystem for LWCPU4
; ============================================================
; Filesystem design:
;   Files are named with a single letter 'a'..'z'.
;   File 'a' lives at segment 0x10, 'b' at 0x11, ..., 'z' at 0x29.
;   A file "exists" when byte 0 of its segment is non-zero.
;   Content is a null-terminated string starting at byte 0.
;
; Why single-character names: with only A and B registers and no
; stack, byte-by-byte comparison of two multi-segment strings is
; very expensive in code bytes.  One-byte names map directly to a
; segment number with no compare needed.
;
; Self-modifying-code trick (used by cat/edit/touch/rm):
;   We need to access a file's segment whose number is only known
;   at run time.  Switching DS via `mov ds, A` works once -- but
;   we can't keep A free across a TTY round-trip.  So before the
;   inner loop, we patch the immediate byte of an inline
;   `mov ds, 0x00` instruction to the file segment.  After that
;   the instruction always switches to the right segment.
;
; Cross-segment calls:
;   PC < 0x10 always fetches from seg 0 (the boot ROM area),
;   regardless of CS.  Two trampolines live there:
;     to_fs    @ 0x06 : mov cs, 1 ; jmp 0x10   (enter FS code)
;     to_shell @ 0x0a : mov cs, 0 ; jmp a      (return to shell)
;
; Commands:
;   help            list commands
;   whoami          print user
;   uname           system identification
;   clear           clear the screen
;   exit            halt
;   ls              list existing files (single letters)
;   cat F           print file F (F is a..z)
;   edit F          append to F until Ctrl+D (0x04)
;   touch F         create empty file F (writes a 0x0a marker)
;   rm F            delete file F
;
; Segment map at runtime:
;   CS=0           main shell code (loaded from binary)
;   CS=1           filesystem code (loaded from binary)
;   DS=2           response strings (loaded from binary)
;   DS=3           input buffer (256 B, zeros at start)
;   DS=0x10..0x29  files 'a'..'z'  (zeros at start)
;   DS=0x40        TTY  (write byte 0 = output, read = input)
; ============================================================

#bankdef seg0 {
    #bits 8
    #addr 0x00
    #outp 0
    #size 0x100
    #fill
}
#bankdef seg1 {
    #bits 8
    #addr 0x00
    #outp 0x800
    #size 0x100
    #fill
}
#bankdef seg2 {
    #bits 8
    #addr 0x00
    #outp 0x1000
    #size 0x100
    #fill
}

; ---- Command codes passed in A when entering seg 1 ----
FS_LS    = 0
FS_CAT   = 1
FS_EDIT  = 2
FS_TOUCH = 3
FS_RM    = 4

; ============================================================
; SEG 0 -- main shell
; ============================================================
#bank seg0

#addr 0x00
boot:
    jmp main                ; CS/DS start at 0 by emulator default

; ---- trampolines in the always-seg-0 area (PC < 0x10) ----
#addr 0x06
to_fs:
    mov cs, 1               ; 2 bytes
    jmp 0x10                ; 2 bytes
; ends at 0x0a

#addr 0x0a
to_shell:
    mov cs, 0               ; 2 bytes
    jmp a                   ; 1 byte
; ends at 0x0d

#addr 0x10
main:
    mov b, s_banner
    jmp print_resp

; print_resp: prints [B] from seg 2, then the prompt, then reads.
print_resp:
.r_lp:
    mov ds, 0x02
    mov a, [b]
    cmp a, 0
    scd z
    jif .pp
    mov ds, 0x40
    mov [0], a
    add b, 1
    jmp .r_lp
.pp:
    mov b, s_prompt
.p_lp:
    mov ds, 0x02
    mov a, [b]
    cmp a, 0
    scd z
    jif read_loop
    mov ds, 0x40
    mov [0], a
    add b, 1
    jmp .p_lp

read_loop:
    mov b, 0
.rl:
    mov ds, 0x40
    and st, 0xfe
    mov a, [0]
    scd c
    jif .rl
    cmp a, 0x0a
    scd z
    jif .done
    mov [0], a              ; echo
    mov ds, 0x03
    mov [b], a
    add b, 1
    jmp .rl
.done:
    mov [0], a              ; echo LF
    mov ds, 0x03
    mov [b], 0

dispatch:
    mov b, 0
.l:
    mov ds, 0x03
    mov a, [b]
    cmp a, 0
    scd z
    jif .ld
    cmp a, 0x20
    scd z
    jif .ld
    add b, 1
    jmp .l
.ld:
    ; B = first-word length (handlers in seg 1 inherit this)
    cmp b, 0
    scd z
    jif read_loop
    cmp b, 2
    scd z
    jif d2
    cmp b, 3
    scd z
    jif d3
    cmp b, 4
    scd z
    jif d4
    cmp b, 5
    scd z
    jif d5
    cmp b, 6
    scd z
    jif d6
    jmp do_unk

d2:
    mov a, [0]
    cmp a, 0x6c             ; 'l' -> ls
    scd z
    jif call_ls
    jmp do_unk

d3:
    mov a, [0]
    cmp a, 0x63             ; 'c' -> cat
    scd z
    jif call_cat
    jmp do_unk

d4:
    mov a, [0]
    cmp a, 0x68             ; 'h' -> help
    scd z
    jif do_help
    cmp a, 0x65             ; 'e' -> edit / exit
    scd z
    jif de
    jmp do_unk
de:
    mov a, [1]
    cmp a, 0x64             ; 'd' -> edit
    scd z
    jif call_edit
    cmp a, 0x78             ; 'x' -> exit
    scd z
    jif do_exit
    jmp do_unk

d5:
    mov a, [0]
    cmp a, 0x75             ; 'u' -> uname
    scd z
    jif do_uname
    cmp a, 0x63             ; 'c' -> clear
    scd z
    jif do_clear
    jmp do_unk

d6:
    mov a, [0]
    cmp a, 0x77             ; 'w' -> whoami
    scd z
    jif do_whoami
    jmp do_unk

; FS call stubs: load command code into A, hop to seg 1.
call_ls:
    mov a, FS_LS
    jmp to_fs
call_cat:
    mov a, FS_CAT
    jmp to_fs
call_edit:
    mov a, FS_EDIT
    jmp to_fs

; Local commands.
do_help:
    mov b, s_help
    jmp print_resp
do_whoami:
    mov b, s_whoami
    jmp print_resp
do_uname:
    mov b, s_uname
    jmp print_resp
do_unk:
    mov b, s_unk
    jmp print_resp

do_clear:
    mov ds, 0x40
    mov b, 12
.cl:
    mov a, 0x0a
    mov [0], a
    sub b, 1
    scd nz
    jif .cl
    jmp print_resp.pp

do_exit:
    jmp do_exit             ; spin forever (no farewell message)

; ============================================================
; SEG 1 -- filesystem code
; On entry: A = command code, B = first-word length (from seg 0).
; ============================================================
#bank seg1
#addr 0x10

fs_entry:
    cmp a, FS_LS
    scd z
    jif fs_ls
    cmp a, FS_CAT
    scd z
    jif fs_cat
    cmp a, FS_EDIT
    scd z
    jif fs_edit
    ; fall through

; Return to shell: emit a trailing newline (in case the handler
; didn't), then jump to the prompt-printer in seg 0.
fs_back:
    mov ds, 0x40
    mov a, 0x0a
    mov [0], a
    mov a, print_resp.pp
    jmp 0x0a                ; to_shell trampoline (always-seg-0 area)

; ------------------------------------------------------------
; ls : print each existing single-letter filename, then newline.
; ------------------------------------------------------------
fs_ls:
    mov b, 0x10             ; segment number (also the file letter offset)
.it:
    ; ds = current file segment
    mov ds, b
    mov a, [0]              ; first byte of file
    cmp a, 0
    scd z
    jif .sk
    ; print letter: 'a' + (B - 0x10) = B + 0x51
    ; (note: `mov a, b` is broken in LWCPU4.asm -- use add instead)
    mov a, 0
    add a, b
    add a, 0x51
    mov ds, 0x40
    mov [0], a
    mov a, 0x20             ; space
    mov [0], a
.sk:
    add b, 1
    cmp b, 0x2a             ; past 'z' (0x10..0x29)?
    scd nz
    jif .it
    jmp fs_back             ; fs_back emits the trailing newline

; ------------------------------------------------------------
; Inline argument helpers used by every NAME-taking handler.
; On entry B = first-word length (the position of the space
; after the command).  We skip spaces, validate that the next
; byte is 'a'..'z', and leave A = file-segment number.
; If anything is wrong we jump straight to fs_back.
; ------------------------------------------------------------
; ------------------------------------------------------------
; cat F : print file's bytes to TTY until a null byte.
; ------------------------------------------------------------
fs_cat:
    ; --- parse + validate single-letter arg ---
    mov ds, 0x03
.sk:
    mov a, [b]
    cmp a, 0
    scd z
    jif fs_back
    cmp a, 0x20
    scd nz
    jif .have
    add b, 1
    jmp .sk
.have:
    cmp a, 0x61             ; 'a'
    scd nc
    jif fs_back
    cmp a, 0x7b             ; one past 'z'
    scd c
    jif fs_back
    sub a, 0x51             ; A = file segment (0x10..0x29)
    ; Patch the loop's `mov ds, IMM` so its imm = file segment.
    mov ds, 0x01
    mov [.pat + 1], a
    mov ds, a               ; ds = file segment
    mov b, 0
.pl:
    mov a, [b]
    cmp a, 0
    scd z
    jif fs_back
    mov ds, 0x40
    mov [0], a
    add b, 1
.pat:
    mov ds, 0x10            ; <- imm byte patched at run time
    jmp .pl

; ------------------------------------------------------------
; edit F : read chars from TTY and append to file F.  Stop on
; Ctrl+D (0x04).  Uses the self-modifying-DS trick.
; ------------------------------------------------------------
fs_edit:
    mov ds, 0x03
.sk:
    mov a, [b]
    cmp a, 0
    scd z
    jif fs_back
    cmp a, 0x20
    scd nz
    jif .have
    add b, 1
    jmp .sk
.have:
    cmp a, 0x61
    scd nc
    jif fs_back
    cmp a, 0x7b
    scd c
    jif fs_back
    sub a, 0x51             ; A = file segment (0x10..0x29)

    ; Patch the inline `mov ds, IMM` instruction below so its
    ; immediate byte = file segment.  Our code lives in seg 1,
    ; so set ds=1 and write A to (.pe + 1).
    mov ds, 0x01
    mov [.pe + 1], a

    ; Now A still equals file segment.  Switch into it and
    ; find the file end (first null byte).
    mov ds, a
    mov b, 0
.fe:
    mov a, [b]
    cmp a, 0
    scd z
    jif .input
    add b, 1
    jmp .fe

.input:
    mov ds, 0x40
    and st, 0xfe
    mov a, [0]
    scd c
    jif .input
    cmp a, 0x04             ; Ctrl+D ends the edit
    scd z
    jif fs_back
    mov [0], a              ; echo
.pe:
    mov ds, 0x10            ; <- imm byte patched at run time
    mov [b], a              ; append char to file
    add b, 1
    jmp .input

; ============================================================
; SEG 2 -- response strings.  Short ones first so all the labels
; we reference via `mov b, label` stay inside i8 range (<0x80).
; ============================================================
#bank seg2

s_banner:
    #d "LWCPU4 sh 1.0\n\0"
s_prompt:
    #d "user@lwcpu4:~$ \0"
s_unk:
    #d "not found\n\0"
s_whoami:
    #d "user\n\0"
s_uname:
    #d "LWCPU4 1.0\n\0"
s_help:
    #d "cmds:\n"
    #d " help    this menu\n"
    #d " ls      list files\n"
    #d " cat F   print file F\n"
    #d " edit F  append to F, end with ^D\n"
    #d " whoami  print user\n"
    #d " uname   sys info\n"
    #d " clear   clear screen\n"
    #d " exit    halt the shell\n\0"
