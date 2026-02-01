# Development Considerations

## File Organization Decisions

### Key Menu Structure
- **layouts/us-qwerty/**: Keyboard layout specific data (key strings, positions, configs)
- **keys/**: Key-related interfaces and classes (KMKey, KMActionKey, etc.)
- **modes/**: Mode implementations (USQwertyMode, etc.)
- **config/**: Configuration types

### Naming Conventions
- Remove "DefaultUSStack" prefix → shorter names
- Use modules over namespaces for clean imports
- `index.ts` files for barrel exports

### TypeScript Patterns
- Interface hierarchy + composition for KMKey types
- Type guards instead of instanceof checks
- Lifecycle hooks: onKeyDownBeforeRender → render → onKeyDown

### Angular/Konva Patterns
- Drawing area: Consider composition vs inheritance debate
- Key menu: Use composition for shared rendering logic

## Pending Decisions

1. **File organization**: Should kmKey.ts go in `keys/` or `key-interfaces.ts`?
2. **Naming**: Shorten type names (remove DefaultUSStack prefix)
3. **Drawing area**: Composition vs inheritance approach

## Alternative Approaches to Try Later
- [ ] Try ActionKey/SubmenuKey inheritance (SubmenuKey extends ActionKey)
- [ ] Try mixins approach for flexible behavior composition
- [ ] Try factory methods + type guards/casts instead of Default classes
