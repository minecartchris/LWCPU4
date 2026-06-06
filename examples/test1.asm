; ============================================
; test1.asm - ASCII Character Print Test
; Prints all printable ASCII characters
; (0x20 space through 0x7E tilde) to the
; display by writing to data segment 0x40.
; ============================================

#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    mov a, 0x20         ; Start at ASCII 0x20 (space character)
    mov ds, 0x40        ; Set data segment to IO (display output)
    scd nc              ; Set condition: branch if carry clear (a < 0x7F)
.loop:
    mov [0], a          ; Write character to display
    add a, 1            ; Move to next ASCII character
    cmp a, 0x7f         ; Check if we've reached DEL (end of printable range)
    jif .loop           ; Keep looping if a < 0x7F
    jmp init            ; Restart from space character
