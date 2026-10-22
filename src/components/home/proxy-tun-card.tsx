import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { showNotice } from '@/services/notice-service'

export const ProxyTunCard = () => {
  const { t } = useTranslation()
  const { indicator } = useSystemProxyState()
  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
        {t(indicator ? 'home.components.proxyTun.status.systemProxyEnabled' : 'home.components.proxyTun.status.systemProxyDisabled')}
      </Typography>
      <ProxyControlSwitches label={t('settings.sections.system.toggles.systemProxy')} onError={(error) => showNotice.error(error)} noRightPadding />
    </Box>
  )
}
