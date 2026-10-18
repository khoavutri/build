import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#a16207',
    colorInfo: '#a16207',
    colorSuccess: '#2f9e44',
    colorWarning: '#e8930c',
    colorError: '#d64545',
    colorLink: '#a16207',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    controlHeight: 34,
  },
  components: {
    Layout: {
      siderBg: '#29221a',
      triggerBg: '#1f1a13',
      headerBg: '#ffffff',
      bodyBg: '#f7f4ee',
    },
    Menu: {
      darkItemBg: '#29221a',
      darkSubMenuItemBg: '#1f1a13',
      darkItemSelectedBg: '#a16207',
      darkItemColor: 'rgba(255,255,255,0.82)',
      darkItemHoverColor: '#ffffff',
    },
    Table: {
      headerBg: '#f5efe5',
      headerColor: '#5b4a2f',
      rowHoverBg: '#fdf9f1',
    },
    Card: {
      headerFontSize: 15,
    },
    Statistic: {
      contentFontSize: 24,
    },
  },
};
