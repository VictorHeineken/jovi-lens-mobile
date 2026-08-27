import { getDemoAction, getDemoAnalysis } from '../../../../services/demoResponses.js';

export async function completeWithDemo({ action = 'analyze', question = '' }) {
  if (action === 'analyze') return { result: getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo' };
  return { result: getDemoAction({ action, question }), provider: 'demo', model: 'jovi-lens-demo' };
}
