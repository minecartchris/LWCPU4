; ============================================================
; linux.asm  --  Linux-style command line shell for LWCPU4
; ============================================================
; LWCPU4 is an 8-bit accumulator CPU with 256-byte segments
; and a TTY at segment 0x40.  Real Linux cannot run on it
; (no MMU, no syscalls, ~64 KB total address space) so this
; program is a faithful *shell experience*: a banner, a
; prompt, line input, and a handful of built-in commands.
;
; Commands (matched on first letter):
;   h   help    list commands
;   l   ls      list (fake) files
;   w   whoami  print user
;   u   uname   print system identification
;   c   clear   clear the screen
;   q   quit    halt the shell
;   else        prints "?"
;
; Memory map:
;   Seg 0x00 : code + string table (this binary)
;   Seg 0x02 : input line buffer (byte 0..0x7F)
;   Seg 0x40 : TTY (read/write byte 0)
;
; Tricks used to fit in one 256-byte segment:
; - string labels live before the code so they fit in i8
;   (the range that `mov b, label` requires);
; - every response ends with "\n$ " so we never need a
;   separate prompt-printing loop -- after do_print we jump
;   straight back into read_loop.
; ============================================================

#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
entry:
    jmp main                ; skip past the string table

; -----------------------------------------------------------
; String table (each ends with "$ " so do_print does double
; duty as the prompt printer).
; -----------------------------------------------------------
s_banner:
    #d "LWCPU4 sh\n$ \0"
s_unk:
    #d "?\n$ \0"
s_help:
    #d "h l w u c q\n$ \0"
s_ls:
    #d "a.bin readme\n$ \0"
s_who:
    #d "user\n$ \0"
s_uname:
    #d "lwcpu4 1.0\n$ \0"

; -----------------------------------------------------------
; main: print the banner, then drop into the read/dispatch
; cycle.  (do_print finishes by jumping to read_loop.)
; -----------------------------------------------------------
main:
    mov b, s_banner
    jmp do_print

; -----------------------------------------------------------
; read_loop: read one line from the TTY into seg 0x02.
; LF (0x0a) terminates and null-terminates the buffer.
; -----------------------------------------------------------
read_loop:
    mov b, 0
.rl:
    mov ds, 0x40
    and st, 0xfe            ; clear carry
    mov a, [0]              ; carry set when no input is waiting
    scd c
    jif .rl
    cmp a, 0x0a             ; LF?
    scd z
    jif .done
    mov [0], a              ; echo
    mov ds, 0x02            ; buffer
    mov [b], a
    add b, 1
    jmp .rl
.done:
    mov [0], a              ; echo the LF (ds is still 0x40)
    mov ds, 0x02
    mov [b], 0              ; null-terminate

; -----------------------------------------------------------
; dispatch on the first byte of the input buffer.
; -----------------------------------------------------------
dispatch:
    mov ds, 0x02
    mov a, [0]
    cmp a, 0
    scd z
    jif read_loop           ; empty line -> just re-prompt
    cmp a, 0x68             ; 'h'
    scd z
    jif d_help
    cmp a, 0x6c             ; 'l'
    scd z
    jif d_ls
    cmp a, 0x77             ; 'w'
    scd z
    jif d_who
    cmp a, 0x75             ; 'u'
    scd z
    jif d_uname
    cmp a, 0x63             ; 'c'
    scd z
    jif do_clear
    cmp a, 0x71             ; 'q'
    scd z
    jif halt
    mov b, s_unk
    jmp do_print

d_help:
    mov b, s_help
    jmp do_print
d_ls:
    mov b, s_ls
    jmp do_print
d_who:
    mov b, s_who
    jmp do_print
d_uname:
    mov b, s_uname
    ; fall through to do_print

; do_print: print null-terminated string at seg 0:[b], then
; jump back to read_loop (each string already includes "$ ").
do_print:
.lp:
    mov ds, 0x00
    mov a, [b]
    cmp a, 0
    scd z
    jif read_loop
    mov ds, 0x40
    mov [0], a
    add b, 1
    jmp .lp

; clear: emit several line feeds, then re-prompt with "$ ".
do_clear:
    mov ds, 0x40
    mov b, 12
.cl:
    mov a, 0x0a
    mov [0], a
    sub b, 1
    scd nz
    jif .cl
    mov a, 0x24             ; '$'
    mov [0], a
    mov a, 0x20             ; ' '
    mov [0], a
    jmp read_loop

; halt: spin forever.
halt:
    jmp halt
