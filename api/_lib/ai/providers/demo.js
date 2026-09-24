// shared/ is the one copy of this content, read by the backend here and by both
// clients' own demo paths. It used to reach into the React Native app's
// services/ directory, which made the backend depend on a client.
import { getDemoAction, getDemoAnalysis, getSubjectDemo } from '../../../../shared/demoResponses.js';

export async function completeWithDemo({ action = 'analyze', question = '', context = null }) {
  if (action === 'analyze') return { result: getDemoAnalysis(), provider: 'demo', model: 'jovi-lens-demo' };
  return { result: getDemoAction({ action, question, context }), provider: 'demo', model: 'jovi-lens-demo' };
}

export async function completeSubjectWithDemo({ action = 'questions', subject = {}, preferences = {} }) {
  return { result: getSubjectDemo({ action, subject, preferences }), provider: 'demo', model: 'jovi-lens-demo' };
}
