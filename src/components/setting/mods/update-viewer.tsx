import { Box, Button, Typography } from '@mui/material'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { BaseDialog, DialogRef } from '@/components/base'
import { openExternalUrl } from '@/utils/open-external-url'
import { version } from '@root/package.json'

export function UpdateViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }))
  return <BaseDialog open={open} title={`Luma ${version}`} onClose={() => setOpen(false)}>
    <Box sx={{ p: 2 }}>
      <Typography sx={{ mb: 2 }}>新版安装包可从 Luma 下载页面获取。安装时会保留本地订阅和设置。</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>Based on Clash Verge Rev 2.5.8 · GPL-3.0</Typography>
      <Button variant="contained" onClick={() => void openExternalUrl('https://proxy.spkiddai.top/')}>打开下载页面</Button>
    </Box>
  </BaseDialog>
}
