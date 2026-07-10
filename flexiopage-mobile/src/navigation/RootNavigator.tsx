import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';
import { useStoreStore } from '../stores/store-store';
import type {
  RootStackParamList,
  TabsParamList,
  OrdersStackParamList,
  ProductsStackParamList,
  DashboardStackParamList,
  MoreStackParamList,
} from './types';
import { LoginScreen } from '../screens/LoginScreen';
import { SelectStoreScreen } from '../screens/SelectStoreScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ProductCreateScreen } from '../screens/ProductCreateScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { colors } from '../theme';

const baseHeader = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.bg },
};

// --- Pile Accueil ---
const DashStack = createNativeStackNavigator<DashboardStackParamList>();
function DashboardStackNav() {
  return (
    <DashStack.Navigator screenOptions={baseHeader}>
      <DashStack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Accueil' }} />
    </DashStack.Navigator>
  );
}

// --- Pile Commandes ---
const OrdStack = createNativeStackNavigator<OrdersStackParamList>();
function OrdersStackNav() {
  return (
    <OrdStack.Navigator screenOptions={baseHeader}>
      <OrdStack.Screen name="Orders" component={OrdersScreen} options={{ title: 'Commandes' }} />
      <OrdStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Commande' }} />
    </OrdStack.Navigator>
  );
}

// --- Pile Produits ---
const ProdStack = createNativeStackNavigator<ProductsStackParamList>();
function ProductsStackNav() {
  return (
    <ProdStack.Navigator screenOptions={baseHeader}>
      <ProdStack.Screen name="Products" component={ProductsScreen} options={{ title: 'Produits' }} />
      <ProdStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Produit' }} />
      <ProdStack.Screen name="ProductCreate" component={ProductCreateScreen} options={{ title: 'Nouveau produit' }} />
    </ProdStack.Navigator>
  );
}

// --- Pile Plus ---
const MrStack = createNativeStackNavigator<MoreStackParamList>();
function MoreStackNav() {
  return (
    <MrStack.Navigator screenOptions={baseHeader}>
      <MrStack.Screen name="More" component={MoreScreen} options={{ title: 'Plus' }} />
    </MrStack.Navigator>
  );
}

// --- Onglets ---
const Tab = createBottomTabNavigator<TabsParamList>();
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          const map: Record<keyof TabsParamList, keyof typeof Ionicons.glyphMap> = {
            Accueil: 'home-outline',
            Commandes: 'receipt-outline',
            Produits: 'pricetags-outline',
            Plus: 'ellipsis-horizontal',
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Accueil" component={DashboardStackNav} />
      <Tab.Screen name="Commandes" component={OrdersStackNav} />
      <Tab.Screen name="Produits" component={ProductsStackNav} />
      <Tab.Screen name="Plus" component={MoreStackNav} />
    </Tab.Navigator>
  );
}

// --- Racine ---
const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentStore = useStoreStore((s) => s.current);

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={baseHeader}>
        {!isAuthenticated ? (
          <RootStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : !currentStore ? (
          <RootStack.Screen
            name="SelectStore"
            component={SelectStoreScreen}
            options={{ title: 'Mes boutiques' }}
          />
        ) : (
          <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
