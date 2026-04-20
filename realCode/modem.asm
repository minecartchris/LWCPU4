#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

; Terminal:      bank 0x40, address 0
; Modem data:    bank 0x40, address 2
; Modem control: bank 0x40, address 3
; Input buffer:  segment 0x02

; Control register bits:
;   Read:  0=DT  6=Ring  7=Data available
;   Write: 0=Connect  1=Disconnect  6=Reset  7=Clear buffer

#addr 0x10
init:
    ; Reset modem and clear buffer
    mov ds, 0x40
    mov a, 0x40         ; Reset (bit 6)
    mov [3], a
    mov a, 0x80         ; Clear buffer (bit 7)
    mov [3], a

prompt:
    ; Print "> "
    mov ds, 0x40
    mov a, 0x3E         ; '>'
    mov [0], a
    mov a, 0x20         ; ' '
    mov [0], a
    mov b, 0            ; Buffer index

inputLoop:
    ; Check for incoming ring
    mov ds, 0x40
    mov a, [3]          ; Read modem status
    and a, 0x40         ; Check ring (bit 6)
    bne ringDetected

    ; Check TTY for input
    and st, 0xfe        ; Clear carry
    mov a, [0]          ; Read TTY
    bcs inputLoop       ; No data, loop back

    ; Check for CR (0x0A)
    cmp a, 0x0A
    beq gotCR
    ; Check for backspace (0x08)
    cmp a, 0x08
    beq gotBS
    ; Ignore control chars < 0x20
    cmp a, 0x20
    bcc inputLoop

    ; Echo and store
    mov ds, 0x40
    mov [0], a          ; Echo to TTY
    mov ds, 0x02
    mov [b], a          ; Store in buffer
    add b, 1
    jmp inputLoop

gotBS:
    cmp b, 0
    beq inputLoop       ; At start, ignore
    mov ds, 0x40
    mov [0], a          ; Echo backspace
    sub b, 1
    jmp inputLoop

gotCR:
    mov ds, 0x40
    mov [0], a          ; Echo CR
    mov ds, 0x02
    mov [b], 0          ; Null terminate

    ; Parse "dail "
    mov b, 0
    mov a, [b]
    cmp a, 0x64         ; 'd'
    bne badCmd
    add b, 1
    mov a, [b]
    cmp a, 0x69         ; 'i'
    bne badCmd
    add b, 1
    mov a, [b]
    cmp a, 0x61         ; 'a'
    bne badCmd
    add b, 1
    mov a, [b]
    cmp a, 0x6C         ; 'l'
    bne badCmd
    add b, 1
    mov a, [b]
    cmp a, 0x20         ; ' '
    bne badCmd
    add b, 1            ; b -> number start
    jmp dialNumber

badCmd:
    mov ds, 0x40
    mov a, 0x3F         ; '?'
    mov [0], a
    mov a, 0x0A
    mov [0], a
    jmp prompt

dialNumber:
    ; Connect modem
    mov ds, 0x40
    mov a, 0x01
    mov [3], a          ; Connect (bit 0)
    ; Send number digits to modem
.loop:
    mov ds, 0x02
    mov a, [b]
    cmp a, 0
    beq talkMode        ; Done dialing, start talk
    mov ds, 0x40
    mov [2], a          ; Send digit to modem
    mov [0], a          ; Echo to TTY
    add b, 1
    jmp .loop

ringDetected:
    ; Print "RING\n"
    mov ds, 0x40
    mov a, 0x52         ; 'R'
    mov [0], a
    mov a, 0x49         ; 'I'
    mov [0], a
    mov a, 0x4E         ; 'N'
    mov [0], a
    mov a, 0x47         ; 'G'
    mov [0], a
    mov a, 0x0A
    mov [0], a
    ; Answer: connect
    mov a, 0x01
    mov [3], a          ; Connect (bit 0)

talkMode:
    mov ds, 0x40
    mov a, [3]          ; Read modem status
    mov b, a            ; Save status

    ; Check connected (DT = bit 0)
    and a, 0x01
    beq disconnected    ; DT clear = disconnected

    ; Check modem data available (bit 7)
    mov a, b
    bpl .checkTTY       ; Bit 7 clear = no data

    ; Read modem data, send to TTY
    and st, 0xfe
    mov a, [2]
    bcs .checkTTY       ; Empty, skip
    mov [0], a          ; Send to TTY

.checkTTY:
    and st, 0xfe        ; Clear carry
    mov a, [0]          ; Read TTY
    bcs talkMode        ; No data, loop
    mov [2], a          ; Send to modem
    jmp talkMode

disconnected:
    mov ds, 0x40
    mov a, 0x02         ; Disconnect (bit 1)
    mov [3], a
    mov a, 0x0A
    mov [0], a
    jmp prompt
