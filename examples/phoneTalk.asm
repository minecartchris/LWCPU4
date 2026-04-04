; loadram "C:/Users/risto/Documents/Git clones/LWCPU4/bin/output2.bin"
#bankdef lc4 {
    #bits 8
    #addr 0
    #outp 0
}

; Buffer at segment 0x02

;mov ds, 0x40    ; IO segment

#addr 0x10

init:
    mov ds, 0x40

loop:
    mov ds, 0x40
    and st, 0xfe
    mov a, [0]
    bcc .charloop1
    and st, 0xfe
    mov a, [2]
    bcc .charloop2
    jmp loop

.charloop1:
    mov [2], a
    jmp loop

.charloop2:
    mov [0], a
    jmp loop
    