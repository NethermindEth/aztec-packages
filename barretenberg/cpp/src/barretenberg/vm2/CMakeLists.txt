barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier)

# vm2_tests needs dsl for integration testing, but this creates circular dependency:
# vm2 provides functions that dsl calls, but tests need dsl functions.
# Solution: Link dsl, then vm2 again to resolve the circular reference.
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(vm2_tests PRIVATE dsl vm2)
endif()
