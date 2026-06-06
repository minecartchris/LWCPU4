; ============================================
; stringInput.asm - String Input and Echo
; Reads a line of text from serial into a
; buffer (segment 0x02), handles backspace
; and carriage return, then prints the
; buffered string back to serial.
; ============================================

#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

; Buffer is stored in segment 0x02

#addr 0x10

; --- Main loop: wait for input, then echo it back ---
init:

    ; Get string input from serial
inputString:
    mov b, 0            ; B = buffer write index
.loop:
    mov ds, 0x40        ; Switch to IO segment
    scd c               ; Set condition: branch while carry set (no data)
.charLoop:
    and st, 0xfe        ; Clear carry flag before read
    mov a, [0]          ; Read character from serial port 0
    jif .charLoop       ; Loop if carry set (buffer empty, no data)

    ; Check for special characters
    scd z               ; Set condition: branch if equal
    cmp a, 0x0a         ; Is it a carriage return (newline)?
    jif .cr
    cmp a, 0x08         ; Is it a backspace?
    jif .bs

    ; Filter out non-printable characters
    scd nc              ; Set condition: branch if less than
    cmp a, 0x20         ; Compare with space (first printable char)
    jif .loop           ; Discard if below 0x20 (control character)

    ; Store printable character in buffer
    mov [0], a          ; Echo character back to serial
    mov ds, 0x02        ; Switch to buffer segment
    mov [b], a          ; Store character at buffer[index]
    add b, 1            ; Increment buffer index
    jmp .loop           ; Continue reading

; --- Handle backspace ---
.bs:
    cmp b, 0            ; Are we at start of buffer?
    jif .loop           ; If so, ignore the backspace
    mov [0], a          ; Echo backspace to serial
    sub b, 1            ; Move buffer index back one position
    jmp .loop           ; Continue reading

; --- Handle carriage return (submit the line) ---
.cr:
    mov [0], a          ; Echo the CR to serial
    mov ds, 0x02        ; Switch to buffer segment
    mov [b], 0          ; Null-terminate the string

    ; Print the buffered string back to serial
printString:
    mov b, 0            ; Reset index to start of buffer
.loop:
    mov ds, 0x02        ; Switch to buffer segment
    mov a, [b]          ; Load character from buffer
    scd z               ; Set condition: branch if zero
    jif .end            ; Stop if null terminator reached
    mov ds, 0x40        ; Switch to IO segment
    mov [0], a          ; Send character to serial
    add b, 1            ; Advance to next character
    jmp .loop           ; Continue printing
.end:
    ; Print two newlines after the echoed string
    mov ds, 0x40        ; Switch to IO segment
    mov a, 0x0a         ; Newline character
    mov [0], a          ; Print first newline
    mov [0], a          ; Print second newline
    jmp init            ; Return to input mode
