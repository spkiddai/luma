import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { openExternalUrl } from '@/utils/open-external-url'
import { version } from '@root/package.json'

export function UpdateViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }))
  return (
    <BaseDialog open={open} title={`Luma ${version}`} onClose={() => setOpen(false)}>
      <Box sx={{ p: 3, maxWidth: 480 }}>
        <Typography sx={{ fontSize: 30, fontWeight: 600, letterSpacing: -1, mb: 1 }}>Luma <Typography component="span" color="text.secondary">流光</Typography></Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t('settings.page.about.description')}</Typography>
        <Button variant="contained" onClick={() => void openExternalUrl('https://proxy.spkiddai.top/#downloads')}>{t('settings.page.about.downloads')}</Button>
        <Divider sx={{ my: 3 }} />
        <Typography sx={{ fontWeight: 600, mb: 1 }}>{t('settings.page.about.openSource')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('settings.page.about.attribution')}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => void openExternalUrl('https://github.com/spkiddai/luma')}>{t('settings.page.about.source')}</Button>
          <Button size="small" onClick={() => void openExternalUrl('https://github.com/spkiddai/luma/blob/main/THIRD_PARTY_NOTICES.md')}>{t('settings.page.about.notices')}</Button>
          <Button size="small" onClick={() => void openExternalUrl('https://github.com/spkiddai/luma/blob/main/LICENSE')}>GPL-3.0</Button>
        </Stack>
      </Box>
    </BaseDialog>
  )
}
