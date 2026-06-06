; ============================================
; hello.asm - Hello World
; Prints the string "I always come back"
; to the serial port, then halts.
; ============================================

#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    mov b, message      ; Load address of the string into B
print:
    mov ds, 0x00        ; Set data segment to page 0 (where string data lives)
    mov a, [b]          ; Load the next character from the string
    scd z               ; Set condition: branch if zero (null terminator)
    jif .end            ; If null terminator, stop printing
    mov ds, 0x40        ; Set data segment to IO
    mov [0], a          ; Send character to serial port
    add b, 1            ; Advance to next character in string
    jmp print           ; Loop to print next character
.end:
    jmp $               ; Halt (infinite loop at current address)

; --- String data ---
message:
    #d "I always come back\n\0"
