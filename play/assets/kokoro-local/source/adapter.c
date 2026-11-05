#include <stdio.h>
#include <espeak-ng/speak_lib.h>

int oki_init(void) {
    return espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, "/usr/share", 0);
}
int oki_synthesize(const char *text, const char *voice) {
    if (espeak_SetVoiceByName(voice) != EE_OK) return 1;
    FILE *output = fopen("/tmp/oki-phonemes.txt", "wb");
    if (!output) return 2;
    espeak_SetSynthCallback(NULL);
    espeak_SetPhonemeTrace((1 << 1), output);
    espeak_ERROR result = espeak_Synth(text, 0, 0, POS_CHARACTER, 0, 0, NULL, NULL);
    espeak_SetPhonemeTrace(0, NULL);
    fclose(output);
    return result == EE_OK ? 0 : 3;
}
