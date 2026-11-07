// The native side of trace-clone.hpp: trace_native model.gguf voice.breeze out.tsv [use_ref] [steps]
#include "trace-clone.hpp"
#include "breeze/voice.h"
#include <fstream>
int main(int argc, char ** argv) {
    using namespace breeze; BreezeModel m; if (!m.load(argv[1], true)) return 1;
    Voice v; if (!load_voice(argv[2], v)) return 2;
    std::ofstream(argv[3]) << tf_trace_clone(m, v.codes, v.frames, v.text, argc > 4 ? atoi(argv[4]) : 1, argc > 5 ? atoi(argv[5]) : 40);
    puts("TRACE DONE"); return 0;
}
