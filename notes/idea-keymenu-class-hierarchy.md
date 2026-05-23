---
title: Alternative class hierarchies for the keymenu
type: idea
---

# Alternative class hierarchies for the keymenu

The current `KMKey` modelling uses separate `KMActionKey`, `KMSubmenuKey`, `KMSubmenuActionKey` types with a shared interface plus type guards. Worth experimenting with alternative arrangements:

- **Inheritance.** `SubmenuKey extends ActionKey`, so a "submenu+action" key is just one type that adds submenu behaviour on top.
- **Mixins.** Compose behaviour fragments (`HasAction`, `HasSubmenu`, `HasRepeater`) into key types without a linear inheritance chain.
- **Factory methods + type guards.** Replace the various `Default*` helper classes with factory functions that return objects matching a discriminated union, and use type guards / casts at the consumer rather than instanceof checks.

None of these is on the critical path. The current structure works; the experiments are worthwhile mainly as a learnability / refactoring exercise once the keymenu's behaviour is fully nailed down. Related: [idea-keymenu-as-library](idea-keymenu-as-library.md) (the library-extraction project would be a natural time to land whichever arrangement reads best).
