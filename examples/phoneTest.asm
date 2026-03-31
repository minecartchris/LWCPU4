#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

; Buffer at segment 0x02

#addr 0x10
init:
    
    mov ds, 0x40    ; IO segment
    mov a, [3]
    bpl init       ; Loop while reading not negative
    
    ; Get string input from serial
inputString:
    mov b, 0        ; Index
.loop:
    mov ds, 0x40    ; IO segment
    scd n           ; Loop while reading negative
.charLoop:
    mov a, [2]      ; Load character from serial
    jif .charLoop   ; Loop on negative
    
    scd z           ; Branch if equal
    cmp a, 0x0a     ; CR
    jif .cr
    cmp a, 0x08     ; BS
    jif .bs
    
    scd nc          ; If less than
    cmp a, 0x20     ; Compare with invalid characters
    jif .loop       ; Back to loop if so
    
    mov [2], a      ; Re-send to serial
    mov ds, 0x02    ; Buffer segment
    mov [b], a      ; Put data into buffer
    add b, 1        ; Inc index
    jmp .loop       ; Loop
    
.bs:
    cmp b, 0        ; Check if at start of buffer
    jif .loop       ; Back to loop if so (Condition set from previous branch)
    mov [2], a      ; Re-send to serial
    sub b, 1        ; Back up by one character
    jmp .loop       ; Loop
    
.cr:
    mov [2], a      ; Send the CR to serial
    mov ds, 0x02    ; Buffer segment
    mov [b], 0      ; Put null termination into buffer
    
    ; Print the buffer contents to serial
printString:
    mov b, 0        ; Start at index 0
.loop:
    mov ds, 0x02    ; Buffer segment
    mov a, [b]      ; Get data
    scd z           ; Zero
    jif .end        ; End if null
    mov ds, 0x40    ; IO segment
    mov [2], a      ; Send it to serial
    add b, 1        ; Next character
    jmp .loop       ; Loop
.end:
    
    mov ds, 0x40    ; IO segment
    mov a, 0x0a     ; CR
    mov [2], a      ; Print the CR
    mov [2], a      ; Print the CR
    jmp init        ; Loop back to start of program