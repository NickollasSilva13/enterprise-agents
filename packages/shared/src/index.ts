import { z } from 'zod';
import { ptBR } from 'zod/locales';

// Validation messages reach the user, so they are in Portuguese everywhere.
z.config(ptBR());

export * from './activity';
export * from './enums';
export * from './frame';
export * from './guide';
export * from './indicators';
export * from './api';
export * from './agents';
export * from './appearance';
export * from './office';
export * from './office-grid';
export * from './office-presets';
export * from './providers';
export * from './runs';
export * from './schedules';
export * from './tasks';
export * from './tools';
export * from './workflow-templates';
