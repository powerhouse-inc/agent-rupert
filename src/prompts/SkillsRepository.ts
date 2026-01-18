import { FileSkillsRepository } from './FileSkillsRepository.js';

/**
 * Default SkillsRepository - alias for FileSkillsRepository
 * Maintained for backward compatibility
 */
export class SkillsRepository extends FileSkillsRepository {
  // This class exists purely for backward compatibility
  // All functionality is inherited from FileSkillsRepository
}