/**
 * Project Config Context
 * 
 * Contexto para passar configurações globais do projeto
 * para componentes filhos sem prop drilling
 */
import React from 'react';
import type { ProjectConfig } from '../types/project';

export const ProjectConfigContext = React.createContext<Partial<ProjectConfig> | null>(null);

export const useProjectConfig = () => {
  const config = React.useContext(ProjectConfigContext);
  return config || {};
};
