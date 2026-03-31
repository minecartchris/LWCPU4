#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

init:
    mov ds, 0
    jmp 0x10    ; Start of program

; A - Address
; B - Segment
switchSegment:
    mov cs, b
    jmp a