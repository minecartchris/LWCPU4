; loadram "C:/Users/risto/Documents/Git clones/LWCPU4/bin/output.bin"
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

init:
    mov ds, 5
    scd n
.loop:
    mov a, [0]
    jif .loop
    mov [0], a
    jmp .loop