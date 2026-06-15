import client from './client'
import { unwrap } from './client'
import type { ModelEvaluation, ModelEvaluationResponse } from '../types/api'

/** 获取模型评估结果 */
export async function fetchModelEvaluation(): Promise<ModelEvaluation[]> {
  const result = await unwrap<ModelEvaluationResponse>(client.get('/model/evaluation'))
  return result.evaluations
}
