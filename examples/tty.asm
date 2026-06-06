; ============================================
; tty.asm - Simple TTY Echo
; Reads characters from serial port and
; echoes them back. Waits for data by polling
; the negative flag on the serial status.
; ============================================

; loadram "/Users/risto/Documents/Git clones/LWCPU4/bin/output.bin"
#bankdef lc4 {
    #bits 8
    #addr 0x10
    #outp 0
}

#addr 0x10
init:
    mov ds, 0x40        ; Set data segment to IO
    scd n               ; Set condition: branch if negative (no data available)
.loop:
    mov a, [0]          ; Read character from serial port
    jif .loop           ; Loop back if no data (negative flag set)
    mov [0], a          ; Echo the character back to serial port
    jmp .loop           ; Continue polling
