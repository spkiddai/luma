import getSystem from '@/utils/get-system'
const OS = getSystem()

// default theme setting
export const defaultTheme = {
  primary_color: '#24745C',
  secondary_color: '#99713B',
  primary_text: '#233932',
  secondary_text: '#65786F',
  info_color: '#427B91',
  error_color: '#FF3B30',
  warning_color: '#FF9500',
  success_color: '#06943D',
  background_color: '#F4F6F2',
  font_family: `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === 'windows' ? ', twemoji mozilla' : ''
  }`,
}

// dark mode
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#8BCDB0',
  secondary_color: '#D5B681',
  primary_text: '#E5EEE8',
  background_color: '#17231F',
  secondary_text: '#A0B3A8',
  info_color: '#89BCCA',
  error_color: '#FF453A',
  warning_color: '#FF9F0A',
  success_color: '#30D158',
}
