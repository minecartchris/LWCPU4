#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x10
init:
    mov a, 0x20
    mov ds, 0x40
    scd nc
.loop:
    mov [0], a
    add a, 1
    cmp a, 0x7f
    jif .loop
    jmp init