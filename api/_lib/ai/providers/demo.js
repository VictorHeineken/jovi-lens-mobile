import { getDemoAction, getDemoAnalysis, getSubjectDemo } from '../../../../services/demoResponses.js';

export async function completeWithDemo({ action = 'analyze', question = '' }) {
  if (action === 'analyze') return { result: getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo' };
  return { result: getDemoAction({ action, question }), provider: 'demo', model: 'jovi-lens-demo' };
}

export async function completeSubjectWithDemo({ action = 'questions', subject = {} }) {
  return { result: getSubjectDemo({ action, subject }), provider: 'demo', model: 'jovi-lens-demo' };
}
