import { ArrowDownwardRounded, ArrowUpwardRounded, MemoryRounded } from '@mui/icons-material'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { LightweightTrafficErrorBoundary } from '@/components/shared/traffic-error-boundary'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVerge } from '@/hooks/use-verge'
import { useVisibility } from '@/hooks/use-visibility'
import parseTraffic from '@/utils/parse-traffic'

export const LayoutTraffic = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const pageVisible = useVisibility()
  const displayMemory = verge?.enable_memory_usage ?? true
  const { response: { data: traffic } } = useTrafficData({ enabled: pageVisible })
  const { response: { data: memory } } = useMemoryData({ enabled: displayMemory && pageVisible })
  const rows = [
    { key: 'downloadSpeed' as const, icon: <ArrowDownwardRounded />, value: traffic?.down || 0, suffix: '/s' },
    { key: 'uploadSpeed' as const, icon: <ArrowUpwardRounded />, value: traffic?.up || 0, suffix: '/s' },
    ...(displayMemory ? [{ key: 'memoryUsage' as const, icon: <MemoryRounded />, value: memory?.inuse || 0, suffix: '' }] : []),
  ]
  return (
    <LightweightTrafficErrorBoundary>
      <Box sx={{ display: 'grid', gap: 1 }}>
        {rows.map(({ key, icon, value, suffix }) => {
          const [amount, unit] = parseTraffic(value)
          return (
            <Box key={key} title={t(`home.components.traffic.metrics.${key}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1, '& svg': { fontSize: 14, color: 'var(--nav-muted)' } }}>
              {icon}
              <Typography component="span" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flex: 1, color: 'var(--nav-strong)' }}>{amount}</Typography>
              <Typography component="span" sx={{ fontSize: 10, color: 'var(--nav-muted)' }}>{unit}{suffix}</Typography>
            </Box>
          )
        })}
      </Box>
    </LightweightTrafficErrorBoundary>
  )
}
