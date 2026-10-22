import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import type { ReactNode } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import type { SortableItemRenderProps } from '@/components/base/sortable-item'
import { useVerge } from '@/hooks/use-verge'

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  sortable?: SortableItemRenderProps
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, sortable } = props
  const { verge } = useVerge()
  const { menu_icon } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()

  const effectiveMenuIcon =
    navCollapsed && menu_icon === 'disable' ? 'monochrome' : menu_icon

  return (
    <ListItem
      ref={sortable?.ref}
      style={sortable?.style}
      sx={{ py: 0.25, px: 0 }}
    >
      <ListItemButton
        ref={sortable?.handleRef}
        selected={!!match}
        aria-current={match ? 'page' : undefined}
        sx={{
          borderRadius: '10px', mx: 1.5, px: 1.5, minHeight: 42,
          color: 'var(--nav-text)',
          '&:hover': { bgcolor: 'var(--nav-hover)', color: 'var(--nav-strong)' },
          '&.Mui-selected, &.Mui-selected:hover': {
            bgcolor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)',
          },
          '& .MuiListItemText-primary': { fontSize: 13, fontWeight: match ? 650 : 500 },
          '& .MuiListItemIcon-root': { color: 'inherit' },
        }}
        title={navCollapsed ? children : undefined}
        aria-label={navCollapsed ? children : undefined}
        onClick={() => navigate(to)}
      >
        {(effectiveMenuIcon === 'monochrome' || !effectiveMenuIcon) && (
          <ListItemIcon
            sx={{
              minWidth: 32,
              cursor: 'inherit',
            }}
          >
            {icon[0]}
          </ListItemIcon>
        )}
        {effectiveMenuIcon === 'colorful' && (
          <ListItemIcon sx={{ minWidth: 32, cursor: 'inherit' }}>{icon[1]}</ListItemIcon>
        )}
        <ListItemText
          sx={{
            textAlign: 'left',
          }}
          primary={children}
        />
      </ListItemButton>
    </ListItem>
  )
}
