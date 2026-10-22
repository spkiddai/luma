import getSystem from '@/utils/get-system'
const OS = getSystem()

// default theme setting
export const defaultTheme = {
  primary_color: '#087BB3',
  secondary_color: '#607F9B',
  primary_text: '#243D50',
  secondary_text: '#5C7284',
  info_color: '#168AC4',
  error_color: '#FF3B30',
  warning_color: '#FF9500',
  success_color: '#06943D',
  background_color: '#F4F9FD',
  font_family: `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === 'windows' ? ', twemoji mozilla' : ''
  }`,
}

// dark mode
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#91C9E8',
  secondary_color: '#ADB6C5',
  primary_text: '#ECEEF2',
  background_color: '#1F2125',
  secondary_text: '#A6ADB8',
  info_color: '#90BFD8',
  error_color: '#FF453A',
  warning_color: '#FF9F0A',
  success_color: '#30D158',
}
