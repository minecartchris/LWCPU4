; ============================================
; bootloader.asm - LWCPU4 Bootloader
; Initializes code and data segments to 0,
; then jumps to program start at address 0x10.
; Also provides a segment-switching subroutine.
; ============================================

; loadram "C:/Users/risto/Documents/Git clones/LWCPU4/bin/boot.bin"
#bankdef lc4 {
    #bits 8
    #addr 0x00
    #outp 0
}

; --- Entry point (address 0x00) ---
init:
    mov cs, 0           ; Initialize code segment to page 0
    mov ds, 0           ; Initialize data segment to page 0
    jmp 0x10            ; Jump to start of user program

; --- Subroutine: switch code segment and jump ---
; Input: A = target address, B = target segment
switchSegment:
    mov cs, b           ; Switch code segment to the page in B
    jmp a               ; Jump to the address in A
