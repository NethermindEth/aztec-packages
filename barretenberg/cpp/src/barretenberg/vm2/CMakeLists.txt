barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier)

# vm2_tests needs dsl for integration testing (avm2_recursion_constraint.test.cpp)
# but vm2 library itself doesn't depend on dsl (avoiding circular dependency)
# Link dsl, then vm2 again to resolve circular references
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(vm2_tests PRIVATE dsl vm2)
endif()
