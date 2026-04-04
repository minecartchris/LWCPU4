; loadram "C:/Users/risto/Documents/Git clones/LWCPU4/bin/boot.bin"
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

init:
    mov cs, 0
    mov ds, 0
    jmp 0x10    ; Start of program

; A - Address
; B - Segment
switchSegment:
    mov cs, b
    jmp a