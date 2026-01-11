# Config Migration Plan

## Overview
Migrating from flat global config to hierarchical agent-specific configuration structure.

## Progress Tracker

### Phase 1: Config Infrastructure ✅
- [x] Replace config.ts imports with defaultConfig.ts
- [x] Update type references from AgentConfig to ServerConfig
- [x] Update server.ts to use defaultConfig
- [x] Test build and runtime

### Phase 2: Update Agent Initialization ✅
- [x] Update AgentInitializer.ts to accept ServerConfig
- [x] Pass agent-specific configs to AgentsManager
- [x] Update AgentsManager config interface
- [x] Test initialization flow

### Phase 3: Update Agent Classes ✅
- [x] Update AgentBase.ts ReactorConfig
- [x] Rename ReactorPackageAgent to ReactorPackageDevAgent
- [x] Update PowerhouseArchitectAgent config
- [x] Test agent instantiation

### Phase 4: Update Server & Routes ✅
- [x] Update server.ts config usage
- [x] Update health.ts route
- [x] Update projects.ts route
- [x] Update info.ts route
- [x] Test all API endpoints

### Phase 5: Project Auto-start Logic ✅
- [x] Update startConfiguredProject() in AgentInitializer
- [x] Use new vetraConfig for ports
- [x] Check autoStartDefaultProject flag
- [x] Test project auto-start

### Phase 6: Cleanup ✅
- [x] Remove old config.ts file
- [x] Remove deprecated env vars from .env
- [x] Final testing and validation
- [x] Update documentation if needed

## Implementation Notes

### Key Changes
1. **Config Structure**: Flat → Hierarchical agent-specific
2. **Agent Naming**: ReactorPackageAgent → ReactorPackageDevAgent
3. **Env Variables**: Renamed to match new structure
4. **Work Drives**: Each agent has its own drive config
5. **Document Management**: Inbox/WBS document support

### Testing Checklist
- [ ] TypeScript compilation (`pnpm build`)
- [ ] Dev server startup (`pnpm dev`)
- [ ] Agent initialization
- [ ] Project auto-start
- [ ] API endpoints
- [ ] Graceful shutdown