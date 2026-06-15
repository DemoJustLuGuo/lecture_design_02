import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { title: '监控总览' },
    },
    {
      path: '/stations',
      name: 'stations',
      component: () => import('@/views/BaseStations.vue'),
      meta: { title: '基站管理' },
    },
    {
      path: '/stations/:id',
      name: 'station-detail',
      component: () => import('@/views/StationDetail.vue'),
      meta: { title: '基站详情' },
    },
    {
      path: '/faults',
      name: 'faults',
      component: () => import('@/views/FaultLogs.vue'),
      meta: { title: '故障日志' },
    },
    {
      path: '/map',
      name: 'fault-map',
      component: () => import('@/views/FaultMap.vue'),
      meta: { title: '故障地图' },
    },
    {
      path: '/diagnosis/:id',
      name: 'diagnosis',
      component: () => import('@/views/Diagnosis.vue'),
      meta: { title: '诊断建议' },
    },
    {
      path: '/metrics',
      name: 'metrics',
      component: () => import('@/views/ModelMetrics.vue'),
      meta: { title: '模型评估' },
    },
    {
      path: '/mobile-alert',
      name: 'mobile-alert',
      component: () => import('@/views/MobileAlert.vue'),
      meta: { title: '移动预警' },
    },
  ],
})

export default router
