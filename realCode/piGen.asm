#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

#addr 0x20
init:
    ; Initialize variables
    mov ds, 0x00
    mov r1, 0          ; i = 0
    mov r2, 0          ; j = 1