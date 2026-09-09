import { Tabs } from 'expo-router';
import Icon from '../../components/Icon.jsx';

const tabs = [
  { name: 'camera', title: 'Câmera', icon: 'camera' },
  { name: 'gallery', title: 'Galeria', icon: 'gallery' },
  { name: 'notes', title: 'Notas', icon: 'note' },
  { name: 'copilot', title: 'Copilot', icon: 'sparkle' },
  { name: 'profile', title: 'Perfil', icon: 'user' },
];

const ACTIVE_COLOR = '#4f46e5';
const INACTIVE_COLOR = '#64748b';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="camera"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={tab.icon} size={21} strokeWidth={focused ? 2.2 : 1.9} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
