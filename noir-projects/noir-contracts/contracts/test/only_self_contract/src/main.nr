use aztec::macros::aztec;

#[aztec]
pub contract OnlySelf {
    use aztec::macros::functions::{external, only_self};

    #[external("private")]
    #[only_self]
    fn only_self_private() {}

    #[external("public")]
    #[only_self]
    fn only_self_public() {}
}

mod test {
    use super::OnlySelf;
    use aztec::{
        protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
    };

    unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
        // Setup test environment
        let mut env = TestEnvironment::new();

        // Create an account to call from
        let caller = env.create_light_account();

        // Deploy contract without initialization
        let instance_address = env.deploy("OnlySelf").without_initializer();

        (env, caller, instance_address)
    }

    #[test(should_fail_with = "Function only_self_private can only be called by the same contract")]
    unconstrained fn only_self_private_fails_if_called_from_other_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        // This should fail because we're calling from a different address (external call)
        // The test environment simulates this as coming from a different caller
        env.call_private(caller, instance.only_self_private());
    }

    #[test(should_fail_with = "Function only_self_public can only be called by the same contract")]
    unconstrained fn only_self_public_fails_if_called_from_other_contract() {
        let (mut env, caller, instance_address) = setup();
        let instance = OnlySelf::at(instance_address);

        // This should fail because we're calling from a different address (external call)
        env.call_public(caller, instance.only_self_public());
    }
}
