import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingCart,
  Search,
  Trash2,
  Plus,
  Smartphone,
  // Settings,
  LogOut,
  Edit,
  Package,
  ArrowLeft,
  CheckCircle,
  // QrCode,
  Sparkles,
  User,
  Lock,
  Mail,
  Upload,
  // Image as ImageIcon,
  Loader2,
  Calendar,
  Save,
  // MessageSquare,
  Send,
  X,
} from "lucide-react";

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";

// --- Tipos de Datos ---
type Category =
  | "Todos"
  | "Bebidas"
  | "Snacks"
  | "Abarrotes"
  | "Licores"
  | "Limpieza";

type Product = {
  id: string;
  name: string;
  price: number;
  category: Category;
  image: string;
  stock: number;
  description: string;
};

type CartItem = Product & { quantity: number };

// Usuario de la Aplicación (Guardado en DB)
type AppUser = {
  id: string; // Firestore Doc ID
  name: string;
  email: string;
  pass: string; // En una app real, esto debería estar encriptado o usar Auth Providers
  role: "user" | "admin";
};

type Order = {
  id: string;
  userId: string;
  userName: string;
  items: CartItem[];
  total: number;
  date: string;
  status: "pending" | "completed";
};

type View = "store" | "cart" | "checkout" | "admin" | "auth" | "my-orders";

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAK3G1Mf-AUNTQqzJQJjSSqUxwUiV1WVwY",
  authDomain: "bodega-kero.firebaseapp.com",
  projectId: "bodega-kero",
  storageBucket: "bodega-kero.firebasestorage.app",
  messagingSenderId: "11529331380",
  appId: "1:11529331380:web:54fa5fb7065b0358e8ede1",
  measurementId: "G-DRWLV9XQQ7",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

// Admin Hardcodeado (Credenciales para chequeo local)
const ADMIN_EMAIL = "kero@admin.com";
const ADMIN_PASS = "adminkero1";

// --- CONFIGURACIÓN GEMINI ---
const GEMINI_API_KEY = "AIzaSyD4guNCXnnb0CQKuio_TZgVpql5uNIvpIY"; // <--- ¡PEGA TU API KEY AQUÍ DENTRO!

// --- DECLARACIÓN DE VARIABLES GLOBALES ---
// Esto soluciona los errores: Cannot find name '__app_id' y '__initial_auth_token'
declare const __app_id: string | undefined;
declare const __initial_auth_token: string | undefined;

export default function App() {
  // --- Estados de Datos (desde Firebase) ---
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dbUsers, setDbUsers] = useState<AppUser[]>([]);

  // --- Estados de Interfaz ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentView, setCurrentView] = useState<View>("auth");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedCategory, setSelectedCategory] = useState<Category>("Todos");
  const [searchTerm, setSearchTerm] = useState("");

  // --- 1. Inicializar Auth de Firebase (Conexión a la nube) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error auth:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. Escuchar Datos en Tiempo Real (Firestore) ---
  useEffect(() => {
    if (!firebaseUser) return;

    // Referencias a colecciones
    // Usamos 'public' para que todos puedan leer los productos y login
    const productsRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "products"
    );
    const ordersRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "orders"
    );
    const usersRef = collection(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "clients"
    );

    // Suscripción a Productos
    const unsubProd = onSnapshot(
      productsRef,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Product)
        );
        setProducts(data);
        setLoading(false);
      },
      (err) => console.error("Error productos:", err)
    );

    // Suscripción a Pedidos
    const unsubOrders = onSnapshot(ordersRef, (snapshot) => {
      const data = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Order)
      );
      // Ordenar por fecha descendente en cliente (Firestore rule limitation)
      setOrders(
        data.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      );
    });

    // Suscripción a Usuarios Registrados
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const data = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as AppUser)
      );
      setDbUsers(data);
    });

    return () => {
      unsubProd();
      unsubOrders();
      unsubUsers();
    };
  }, [firebaseUser]);

  // --- Lógica Carrito ---
  const addToCart = (product: Product) => {
    if (product.stock <= 0) return alert("¡Ya no queda stock hermanito!");
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const product = products.find((p) => p.id === id);
          const newQuantity = Math.max(
            1,
            Math.min(item.quantity + delta, product?.stock || 1)
          );
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((item) => item.id !== id));
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleLogout = () => {
    setCurrentUser(null);
    setCart([]);
    setCurrentView("auth");
  };

  // --- Vistas ---

  // --- COMPONENTE 1: CHATBOT GEMINI ---
  // --- COMPONENTE 1: CHATBOT GEMINI (CON RESPALDO INTELIGENTE) ---
  const AIChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [msgs, setMsgs] = useState([
      { role: "model", text: "¡Hola! Soy KeroBot. ¿Qué se te antoja hoy?" },
    ]);
    const [input, setInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al final del chat
    useEffect(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs, isOpen]);

    // Función de respaldo: Si la IA falla, responde esto
    const responderSimulado = (texto: string) => {
      const t = texto.toLowerCase();
      if (t.includes("hola") || t.includes("buenas")) return "¡Habla caserito! Bienvenido a la bodega.";
      if (t.includes("precio") || t.includes("cuanto")) return "Los precios están baratísimos, revisa el catálogo arriba mano.";
      if (t.includes("yape") || t.includes("plin")) return "Sí aceptamos Yape y Plin. El número es 954 305 131.";
      if (t.includes("gracias")) return "A ti, ¡vuelve pronto!";
      if (t.includes("chela") || t.includes("cerveza") || t.includes("tomar")) return "Tenemos las heladitas. Revisa la sección de Licores.";
      return "Claro que sí, revisa nuestro stock o pregúntame por algo específico.";
    };

    const handleSend = async (e) => {
      e.preventDefault();
      if (!input.trim() || thinking) return;
      
      const userText = input;
      setMsgs((prev) => [...prev, { role: "user", text: userText }]);
      setInput("");
      setThinking(true);

      // Intento 1: Usar la IA Real
      try {
        const inventory = products.map((p) => `${p.name} (S/ ${p.price})`).join(", ");
        const context = `Eres el asistente de "Bodega Kero" en Huancayo. Inventario actual: ${inventory}. Responde amable, corto y con jerga peruana respetuosa. Usuario: ${userText}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: context }] }],
            }),
          }
        );

        const data = await res.json();

        // Si Google nos da error, lanzamos una excepción para ir al respaldo
        if (data.error) throw new Error("Error de API Google");

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error("Respuesta vacía");

        setMsgs((prev) => [...prev, { role: "model", text: reply }]);

      } catch (err) {
        console.error("Fallo la IA, usando respaldo:", err);
        // Intento 2: Usar Respaldo Simulado (Para que el usuario no note el error)
        setTimeout(() => {
           setMsgs((prev) => [...prev, { role: "model", text: responderSimulado(userText) }]);
        }, 500); // Pequeña pausa para naturalidad
      }
      
      setThinking(false);
    };

    if (!isOpen)
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:scale-105 z-50 animate-bounce"
        >
          <Sparkles size={24} />
        </button>
      );

    return (
      <div className="fixed bottom-6 right-6 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden h-96">
        <div className="bg-indigo-600 p-3 text-white flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <Sparkles size={18} />
            <span className="font-bold text-sm">KeroBot IA</span>
          </div>
          <button onClick={() => setIsOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`text-xs p-2 rounded-xl max-w-[85%] ${
                m.role === "user"
                  ? "bg-indigo-100 text-indigo-900 ml-auto"
                  : "bg-white border text-slate-700"
              }`}
            >
              {m.text}
            </div>
          ))}
          {thinking && (
            <div className="text-xs text-slate-400 italic p-2">
              Escribiendo...
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={handleSend} className="p-2 border-t flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 text-xs border rounded-full px-3 py-2 outline-none"
            placeholder="Pregunta algo..."
          />
          <button
            type="submit"
            className="bg-indigo-600 text-white p-2 rounded-full"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    );
  };

  // --- COMPONENTE 2: MIS PEDIDOS ---
  const MyOrdersView = () => {
    const myOrders = orders.filter((o) => o.userId === currentUser?.id);
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => setCurrentView("store")}
          className="flex items-center gap-2 text-slate-500 mb-6 font-bold"
        >
          <ArrowLeft size={18} /> Volver a la tienda
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Package className="text-orange-600" /> Mis Pedidos Anteriores
        </h2>
        {myOrders.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
            Aún no has hecho pedidos, caserito.
          </div>
        ) : (
          <div className="space-y-4">
            {myOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-400 font-mono mb-1">
                    ID: {order.id.slice(0, 8)}...
                  </p>
                  <p className="text-sm text-slate-500">{order.date}</p>
                  <div className="mt-3">
                    {order.items.map((i) => (
                      <p
                        key={i.id}
                        className="text-sm font-medium text-slate-700"
                      >
                        • {i.quantity}x {i.name}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-orange-600">
                    S/ {order.total.toFixed(2)}
                  </p>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${
                      order.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {order.status === "completed"
                      ? "Entregado"
                      : "Pendiente / Por Recoger"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const AuthView = () => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [formData, setFormData] = useState({ name: "", email: "", pass: "" });
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!firebaseUser) return setError("Conectando con el servidor...");

      if (isRegistering) {
        // Registro
        if (dbUsers.find((u) => u.email === formData.email)) {
          return setError("Este correo ya está registrado.");
        }

        try {
          // Crear usuario en Firestore
          const newUser = {
            name: formData.name,
            email: formData.email,
            pass: formData.pass,
            role: "user" as const,
          };
          const docRef = await addDoc(
            collection(db, "artifacts", appId, "public", "data", "clients"),
            newUser
          );

          const createdUser = { id: docRef.id, ...newUser };
          setCurrentUser(createdUser);
          setCurrentView("store");
        } catch (err) {
          setError("Error al registrar. Intenta de nuevo.");
        }
      } else {
        // Login
        // Caso Especial: Admin Hardcodeado
        if (formData.email === ADMIN_EMAIL && formData.pass === ADMIN_PASS) {
          setCurrentUser({
            id: "admin-master",
            name: "Kero Admin",
            email: ADMIN_EMAIL,
            pass: ADMIN_PASS,
            role: "admin",
          });
          setCurrentView("admin");
          return;
        }

        // Login Usuario Normal
        const user = dbUsers.find(
          (u) => u.email === formData.email && u.pass === formData.pass
        );
        if (user) {
          setCurrentUser(user);
          setCurrentView(user.role === "admin" ? "admin" : "store");
        } else {
          setError("Correo o contraseña incorrectos.");
        }
      }
    };

    return (
      <div className="min-h-[90vh] flex items-center justify-center p-4 bg-gradient-to-br from-yellow-50 to-orange-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-orange-100 w-full max-w-sm">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-orange-600 mb-1">
              Bodega Kero
            </h2>
            <p className="text-slate-400 text-sm">Huancayo - Perú</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div className="relative">
                <User
                  className="absolute left-3 top-3 text-slate-400"
                  size={20}
                />
                <input
                  required
                  type="text"
                  placeholder="Tu nombre"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full pl-10 p-3 rounded-lg border border-slate-200 focus:border-orange-500 outline-none"
                />
              </div>
            )}
            <div className="relative">
              <Mail
                className="absolute left-3 top-3 text-slate-400"
                size={20}
              />
              <input
                required
                type="email"
                placeholder="Correo electrónico"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full pl-10 p-3 rounded-lg border border-slate-200 focus:border-orange-500 outline-none"
              />
            </div>
            <div className="relative">
              <Lock
                className="absolute left-3 top-3 text-slate-400"
                size={20}
              />
              <input
                required
                type="password"
                placeholder="Contraseña"
                value={formData.pass}
                onChange={(e) =>
                  setFormData({ ...formData, pass: e.target.value })
                }
                className="w-full pl-10 p-3 rounded-lg border border-slate-200 focus:border-orange-500 outline-none"
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <button
              disabled={!firebaseUser}
              className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-200 disabled:opacity-50"
            >
              {isRegistering ? "Crear Cuenta" : "Ingresar"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {isRegistering ? "¿Ya tienes caserito? " : "¿Primera vez aquí? "}
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError("");
              }}
              className="text-orange-600 font-bold hover:underline"
            >
              {isRegistering ? "Ingresa" : "Regístrate"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AdminPanel = () => {
    const [tab, setTab] = useState("products"); // "products" | "orders"

    // SOLUCIÓN ERRORES DE FORM DATA: Inicializamos con TODAS las propiedades
    const [formData, setFormData] = useState({
      name: "",
      price: 0,
      stock: 0,
      category: "Bebidas" as Category, // Forzamos el tipo Category
      image: "",
      description: "",
    });

    // SOLUCIÓN ERROR setIsEditing: Definimos que puede ser string o null
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // --- NUEVOS ESTADOS PARA VENTA MANUAL ---
    const [showManualOrder, setShowManualOrder] = useState(false);
    const [manualOrder, setManualOrder] = useState({
      date: "",
      client: "",
      desc: "",
      total: "",
    });

    // SOLUCIÓN ERROR handleImageUpload: Tipo explícito para el evento de input file
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (file.size > 500000) {
          alert(
            "La imagen es muy pesada. Intenta con una más pequeña (Max 500KB)."
          );
          return;
        }
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData({ ...formData, image: reader.result as string });
          setUploading(false);
        };
        reader.readAsDataURL(file);
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      // <--- AQUÍ SÍ VA
      e.preventDefault();
      if (!firebaseUser) return;

      // Aquí formData SÍ tiene category, price, etc. porque es el estado del Admin
      const productData = {
        name: formData.name || "Producto sin nombre",
        price: Number(formData.price),
        stock: Number(formData.stock),
        category: formData.category,
        image:
          formData.image || "https://via.placeholder.com/300?text=Sin+Imagen",
        description: formData.description || "",
      };

      try {
        if (isEditing) {
          // ... lógica de editar
          const docRef = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "products",
            isEditing
          );
          await updateDoc(docRef, productData);
          setIsEditing(null);
        } else {
          // ... lógica de crear nuevo
          await addDoc(
            collection(db, "artifacts", appId, "public", "data", "products"),
            productData
          );
        }
        // Limpiamos el formulario correctamente
        setFormData({
          name: "",
          price: 0,
          stock: 0,
          category: "Bebidas",
          image: "",
          description: "",
        });
      } catch (err) {
        alert("Error al guardar producto");
        console.error(err);
      }
    };

    // --- NUEVA FUNCIÓN: GUARDAR VENTA PASADA ---
    const handleManualOrderSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualOrder.date || !manualOrder.total)
        return alert("Fecha y Total requeridos");

      const newOrder = {
        userId: "manual-entry",
        userName: manualOrder.client || "Cliente en Tienda",
        items: [
          {
            id: "manual",
            name: manualOrder.desc || "Venta de Mostrador",
            price: Number(manualOrder.total),
            category: "Abarrotes",
            image: "",
            stock: 1,
            description: "",
            quantity: 1,
          },
        ],
        total: Number(manualOrder.total),
        date: new Date(manualOrder.date).toLocaleString(),
        status: "completed",
      };

      try {
        await addDoc(
          collection(db, "artifacts", appId, "public", "data", "orders"),
          newOrder
        );
        setManualOrder({ date: "", client: "", desc: "", total: "" });
        setShowManualOrder(false);
        alert("Venta histórica registrada correctamente");
      } catch (err) {
        alert("Error al registrar venta");
      }
    };

    // --- NUEVA FUNCIÓN: CAMBIAR ESTADO DE PEDIDO ---
    const toggleOrderStatus = async (order: Order) => {
      const newStatus = order.status === "pending" ? "completed" : "pending";
      try {
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "orders", order.id),
          { status: newStatus }
        );
      } catch (err) {
        alert("Error al actualizar estado");
      }
    };

    const handleDelete = async (id: string) => {
      if (confirm("¿Borrar este producto?")) {
        await deleteDoc(
          doc(db, "artifacts", appId, "public", "data", "products", id)
        );
      }
    };

    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-slate-900">
            Administrar Bodega
          </h2>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-700">
              {currentUser?.name}
            </p>
            <button
              onClick={handleLogout}
              className="text-xs text-red-500 hover:underline"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        <div className="flex gap-4 mb-8 border-b border-slate-200">
          <button
            onClick={() => setTab("products")}
            className={`pb-3 font-bold px-4 ${
              tab === "products"
                ? "text-orange-600 border-b-2 border-orange-600"
                : "text-slate-400"
            }`}
          >
            Productos
          </button>
          <button
            onClick={() => setTab("orders")}
            className={`pb-3 font-bold px-4 ${
              tab === "orders"
                ? "text-orange-600 border-b-2 border-orange-600"
                : "text-slate-400"
            }`}
          >
            Pedidos{" "}
            <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full ml-1">
              {orders.length}
            </span>
          </button>
        </div>

        {tab === "products" ? (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-fit">
              <h3 className="font-bold mb-4">
                {isEditing ? "Editar" : "Nuevo"} Producto
              </h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500">
                    Nombre
                  </label>
                  <input
                    required
                    placeholder="Ej: Inka Cola 3L"
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-500">
                      Precio
                    </label>
                    <input
                      required
                      type="number"
                      step="0.10"
                      placeholder="0.00"
                      value={formData.price || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price: parseFloat(e.target.value),
                        })
                      }
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">
                      Stock
                    </label>
                    <input
                      required
                      type="number"
                      placeholder="0"
                      value={formData.stock || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: parseInt(e.target.value),
                        })
                      }
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500">
                    Categoría
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category: e.target.value as Category,
                      })
                    }
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option>Bebidas</option>
                    <option>Snacks</option>
                    <option>Abarrotes</option>
                    <option>Licores</option>
                    <option>Limpieza</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Imagen del Producto
                  </label>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    {formData.image ? (
                      <div className="relative">
                        <img
                          src={formData.image}
                          alt="Preview"
                          className="h-20 mx-auto object-contain rounded"
                        />
                        <p className="text-xs text-green-600 mt-2">
                          Imagen cargada
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <Upload size={24} className="mb-1" />
                        <span className="text-xs">Click para subir foto</span>
                      </div>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="animate-spin text-orange-500" />
                      </div>
                    )}
                  </div>
                  <input
                    placeholder="https://..."
                    value={formData.image || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, image: e.target.value })
                    }
                    className="w-full p-2 mt-1 border rounded-lg text-xs"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(null);
                        setFormData({
                          name: "",
                          price: 0,
                          stock: 0,
                          category: "Bebidas",
                          image: "",
                          description: "",
                        });
                      }}
                      className="flex-1 bg-slate-100 py-2 rounded-lg font-bold text-slate-600"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    disabled={uploading}
                    className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 p-3 border-b text-xs font-bold text-slate-500 flex justify-between">
                <span>LISTA DE PRODUCTOS ({products.length})</span>
                <span>DB: Firestore</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-white border-b sticky top-0">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-400">
                        ITEM
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-400">
                        INFO
                      </th>
                      <th className="p-4 text-right text-xs font-bold text-slate-400">
                        ACCIONES
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-4 w-16">
                          <img
                            src={p.image}
                            className="w-12 h-12 rounded object-cover bg-slate-100"
                            alt=""
                          />
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{p.name}</p>
                          <div className="flex gap-2 text-xs mt-1">
                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                              {p.category}
                            </span>
                            <span className="text-slate-500">
                              Stock: {p.stock}
                            </span>
                            <span className="font-bold text-slate-900">
                              S/ {p.price.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              setIsEditing(p.id);
                              setFormData(p);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="p-8 text-center text-slate-400"
                        >
                          No hay productos. Agrega uno.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!showManualOrder ? (
              <button
                onClick={() => setShowManualOrder(true)}
                className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-700 transition-colors"
              >
                <Calendar size={16} /> Registrar Venta Pasada
              </button>
            ) : (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl max-w-2xl animate-in fade-in slide-in-from-top-2">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Calendar className="text-orange-600" size={20} /> Registrar
                  Venta Histórica
                </h3>
                <form
                  onSubmit={handleManualOrderSubmit}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div>
                    <label className="text-xs font-bold text-slate-500">
                      Fecha y Hora de la venta
                    </label>
                    <input
                      required
                      type="datetime-local"
                      value={manualOrder.date}
                      onChange={(e) =>
                        setManualOrder({ ...manualOrder, date: e.target.value })
                      }
                      className="w-full p-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">
                      Nombre del Cliente (Opcional)
                    </label>
                    <input
                      placeholder="Ej: Vecina María"
                      value={manualOrder.client}
                      onChange={(e) =>
                        setManualOrder({
                          ...manualOrder,
                          client: e.target.value,
                        })
                      }
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500">
                      Descripción (¿Qué llevó?)
                    </label>
                    <input
                      required
                      placeholder="Ej: 2 Gaseosas y 1 Paquete de galletas"
                      value={manualOrder.desc}
                      onChange={(e) =>
                        setManualOrder({ ...manualOrder, desc: e.target.value })
                      }
                      className="w-full p-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">
                      Monto Total (S/)
                    </label>
                    <input
                      required
                      type="number"
                      step="0.10"
                      placeholder="0.00"
                      value={manualOrder.total}
                      onChange={(e) =>
                        setManualOrder({
                          ...manualOrder,
                          total: e.target.value,
                        })
                      }
                      className="w-full p-2 border rounded-lg font-bold text-orange-600"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowManualOrder(false)}
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 font-bold hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 flex-1 flex items-center justify-center gap-2"
                    >
                      <Save size={16} /> Guardar en Historial
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {orders.length === 0 ? (
                <p className="p-8 text-center text-slate-400">
                  No hay pedidos aún.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Pedido</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="p-4">
                          <p className="font-bold text-sm">{o.userName}</p>
                          {o.userId === "manual-entry" ? (
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded border border-slate-300 font-bold">
                              Manual
                            </span>
                          ) : (
                            <p className="text-xs text-slate-400 font-mono">
                              ID: {o.id.slice(0, 6)}
                            </p>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-600">
                          {o.items.map((i) => (
                            <div key={i.id} className="mb-1">
                              • {i.quantity}x {i.name}
                            </div>
                          ))}
                        </td>
                        <td className="p-4 font-bold text-orange-600">
                          S/ {o.total.toFixed(2)}
                        </td>
                        <td className="p-4 text-xs text-slate-400">{o.date}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => toggleOrderStatus(o)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                              o.status === "completed"
                                ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200"
                            }`}
                          >
                            {o.status === "completed"
                              ? "Entregado"
                              : "Pendiente"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const CheckoutView = () => {
    const [success, setSuccess] = useState(false);
    const [processing, setProcessing] = useState(false);

    const confirmOrder = async () => {
      setProcessing(true);

      try {
        const newOrder = {
          userId: currentUser?.id || "anon",
          userName: currentUser?.name || "Invitado",
          items: cart,
          total: cartTotal * 1.18,
          date: new Date().toLocaleString(),
          status: "pending" as const,
        };

        // 1. Guardar Orden en Firestore
        await addDoc(
          collection(db, "artifacts", appId, "public", "data", "orders"),
          newOrder
        );

        // 2. Actualizar Stock en Firestore
        for (const item of cart) {
          const productRef = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "products",
            item.id
          );
          const currentProd = products.find((p) => p.id === item.id);
          if (currentProd) {
            await updateDoc(productRef, {
              stock: Math.max(0, currentProd.stock - item.quantity),
            });
          }
        }

        setSuccess(true);
        setCart([]);
      } catch (err) {
        alert("Error al procesar pedido");
        console.error(err);
      }
      setProcessing(false);
    };

    if (success)
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-green-50 m-4 rounded-3xl border border-green-100">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 animate-bounce">
            <CheckCircle size={40} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            ¡Listo Caserito!
          </h2>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-md">
            <p className="text-xl font-medium text-slate-800 mb-2">
              "Realice el pago y recoja su pedido mostrando la pantalla de sus
              celulares en el negocio. Pick and go."
            </p>
          </div>
          <button
            onClick={() => setCurrentView("store")}
            className="mt-8 text-orange-600 font-bold hover:underline"
          >
            Volver a comprar
          </button>
        </div>
      );

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => setCurrentView("cart")}
          className="flex items-center gap-2 text-slate-500 hover:text-orange-600 mb-6 font-medium"
        >
          <ArrowLeft size={18} /> Volver
        </button>

        <h2 className="text-2xl font-bold mb-6">Confirmar Pedido</h2>

        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 to-purple-500"></div>
          <h3 className="font-bold text-2xl text-slate-800 mb-6">
            Monto a Pagar:{" "}
            <span className="text-pink-600">
              S/ {(cartTotal * 1.18).toFixed(2)}
            </span>
          </h3>

          <div className="bg-slate-50 p-6 rounded-xl border-2 border-dashed border-slate-300 mb-8 max-w-sm mx-auto">
            <div className="flex justify-center gap-4 mb-4 text-slate-400">
              <Smartphone size={32} />
            </div>
            <p className="text-sm text-slate-500 mb-1 uppercase tracking-wider font-bold">
              Yapear / Plinear al:
            </p>
            <p className="text-3xl font-black text-slate-900 mb-4 tracking-tight">
              954 305 131
            </p>

            <div className="w-full h-px bg-slate-200 mb-4"></div>

            <p className="text-xs text-slate-500 mb-1">A nombre de:</p>
            <p className="text-lg font-bold text-slate-800">
              Victoria Domitilia
              <br />
              Arauco Ureta
            </p>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg text-yellow-800 text-sm mb-8 flex items-start gap-3 text-left">
            <Smartphone className="shrink-0 mt-0.5" size={18} />
            <p>
              <strong>Importante:</strong> Al recoger tu pedido en la bodega,
              deberás mostrar la captura de pantalla de la transferencia en tu
              celular.
            </p>
          </div>

          <button
            disabled={processing}
            onClick={confirmOrder}
            className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-pink-700 shadow-xl shadow-pink-200 transition-all transform hover:-translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CheckCircle />
            )}
            {processing
              ? "Registrando Pedido..."
              : "Ya realicé el pago, Confirmar"}
          </button>
        </div>
      </div>
    );
  };

  const Navbar = () => (
    <nav className="bg-orange-600 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Package />
          <span>Bodega Kero</span>
        </div>
        {currentUser && (
          <div className="flex items-center gap-4">
            {currentUser.role === "user" && (
              <>
                <button
                  onClick={() => setCurrentView("my-orders")}
                  className="mr-2 text-xs font-bold bg-white/20 px-3 py-1 rounded-full hover:bg-white/30 transition-colors"
                >
                  Mis Pedidos
                </button>
                <button
                  onClick={() => setCurrentView("cart")}
                  className="relative p-2 hover:bg-orange-700 rounded-full"
                >
                  <ShoppingCart size={24} />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-white text-orange-600 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full animate-bounce">
                      {cartCount}
                    </span>
                  )}
                </button>
              </>
            )}
            <div className="text-right leading-none hidden sm:block">
              <div className="font-bold text-sm">{currentUser.name}</div>
              <div className="text-[10px] opacity-80 uppercase">
                {currentUser.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-orange-700 p-2 rounded-lg hover:bg-orange-800"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );

  const StoreView = () => {
    const categories: Category[] = [
      "Todos",
      "Bebidas",
      "Snacks",
      "Abarrotes",
      "Licores",
    ];
    const filtered = products.filter(
      (p) =>
        (selectedCategory === "Todos" || p.category === selectedCategory) &&
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                  selectedCategory === c
                    ? "bg-orange-600 text-white shadow-lg shadow-orange-200"
                    : "bg-white text-slate-500 border border-slate-200 hover:border-orange-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 py-2 rounded-full border focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 flex flex-col items-center">
            <Loader2 className="animate-spin mb-2" size={40} />
            <p>Cargando productos de la bodega...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all group flex flex-col"
              >
                <div className="h-40 bg-slate-50 relative overflow-hidden">
                  <img
                    src={p.image}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    alt={p.name}
                  />
                  {p.stock === 0 && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center font-bold text-slate-800">
                      AGOTADO
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    {p.category}
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-2 line-clamp-2">
                    {p.name}
                  </h3>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="font-bold text-lg text-slate-900">
                      S/ {p.price.toFixed(2)}
                    </span>
                    <button
                      disabled={p.stock === 0}
                      onClick={() => addToCart(p)}
                      className="bg-orange-100 text-orange-700 p-2 rounded-lg hover:bg-orange-600 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-10 text-slate-400">
                <Package size={40} className="mx-auto mb-2 opacity-20" />
                <p>No se encontraron productos.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-600 pb-10">
      {currentView !== "auth" && <Navbar />}
      {currentView === "auth" && <AuthView />}
      {currentView === "store" && <StoreView />}
      {currentView === "cart" && (
        <div className="max-w-xl mx-auto px-4 py-8">
          <button
            onClick={() => setCurrentView("store")}
            className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-500"
          >
            <ArrowLeft size={16} /> Volver
          </button>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="bg-orange-600 p-4 text-white flex items-center gap-2 font-bold">
              <ShoppingCart /> Tu Canasta
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-center py-8 text-slate-400">Canasta vacía</p>
              ) : (
                cart.map((i) => (
                  <div
                    key={i.id}
                    className="flex gap-4 py-4 border-b last:border-0"
                  >
                    <img
                      src={i.image}
                      className="w-16 h-16 rounded object-cover bg-slate-50"
                    />
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{i.name}</h4>
                      <p className="text-orange-600 font-bold text-sm">
                        S/ {(i.price * i.quantity).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => updateQuantity(i.id, -1)}
                          className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="text-sm">{i.quantity}</span>
                        <button
                          onClick={() => updateQuantity(i.id, 1)}
                          className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(i.id)}
                      className="text-red-400 self-center"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <div className="p-4 bg-slate-50 border-t">
                <div className="flex justify-between font-bold text-lg mb-4 text-slate-800">
                  <span>Total</span>
                  <span>S/ {(cartTotal * 1.18).toFixed(2)}</span>
                </div>
                <button
                  onClick={() => setCurrentView("checkout")}
                  className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700"
                >
                  Ir a Pagar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {currentView === "checkout" && <CheckoutView />}
      {currentView === "admin" && <AdminPanel />}
      {currentView === "my-orders" && <MyOrdersView />}
      {/* Mostrar Chat solo a usuarios normales */}
      {currentUser && currentUser.role === "user" && <AIChat />}
    </div>
  );
}
