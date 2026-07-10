import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Order } from '../types';

// --- Stacks par onglet ---
export type OrdersStackParamList = {
  Orders: undefined;
  OrderDetail: { orderId: string; orderNumber: string };
};

export type ProductsStackParamList = {
  Products: undefined;
  ProductDetail: { productId: string };
  ProductCreate: undefined;
};

export type DashboardStackParamList = {
  Dashboard: undefined;
};

export type MoreStackParamList = {
  More: undefined;
};

// --- Onglets ---
export type TabsParamList = {
  Accueil: NavigatorScreenParams<DashboardStackParamList>;
  Commandes: NavigatorScreenParams<OrdersStackParamList>;
  Produits: NavigatorScreenParams<ProductsStackParamList>;
  Plus: NavigatorScreenParams<MoreStackParamList>;
};

// --- Racine ---
export type RootStackParamList = {
  Login: undefined;
  SelectStore: undefined;
  Tabs: NavigatorScreenParams<TabsParamList>;
};

export type { Order };
