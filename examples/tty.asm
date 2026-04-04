; loadram "/Users/risto/Documents/Git clones/LWCPU4/bin/output.bin"
#bankdef lc4 {
    #bits 8
    #addr 0x10
    #outp 0
}

#addr 0x10
init:
    mov ds, 0x40
    scd n
.loop:
    mov a, [0]
    jif .loop
    mov [0], a
    jmp .loop