import { useState, useEffect } from 'react';
import './App.css';
import { 
  products as initialProducts
} from './data';
import { 
  Search, 
  User, 
  Star, 
  Check, 
  X, 
  Info,
  Layers,
  ChevronRight,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Lock,
  ArrowRight,
  ArrowLeft,
  Edit3,
  FileText,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';


const mapApiProduct = (item, productsList) => {
  if (!item) return null;
  // If item is already mapped or is from mock data
  if (item.id && !item.item_id && !item.parent_asin) {
    return item;
  }

  const itemId = item.item_id || item.parent_asin;
  const prod = productsList.find(p => p.id === itemId);
  
  const titleVal = item.title || item.name || (prod ? prod.name : "Product " + itemId);
  const brandVal = item.main_category || item.brand || (prod ? prod.brand : "Unknown");
  
  let categoriesList = [];
  if (item.categories) {
    if (Array.isArray(item.categories)) {
      categoriesList = item.categories;
    } else if (typeof item.categories === 'string') {
      try {
        categoriesList = JSON.parse(item.categories);
      } catch {
        categoriesList = [item.categories];
      }
    }
  } else if (prod && prod.category) {
    categoriesList = [prod.category];
  }
  
  const catVal = categoriesList.length > 0 ? categoriesList[0] : "General";
  
  let priceVal = 14.99;
  if (item.price !== undefined && item.price !== null) {
    if (typeof item.price === 'number') {
      priceVal = item.price;
    } else if (typeof item.price === 'string') {
      priceVal = parseFloat(item.price.replace(/[^0-9.]/g, '')) || (prod ? prod.price : 14.99);
    }
  } else if (prod) {
    priceVal = prod.price;
  }
  
  const ratingVal = item.average_rating !== undefined ? (typeof item.average_rating === 'number' ? item.average_rating : parseFloat(item.average_rating) || 4.0) : (prod ? prod.rating : 4.0);
  const reviewCountVal = item.rating_number !== undefined ? parseInt(item.rating_number) : (prod ? prod.reviewCount : 0);
  const imageVal = item.images || item.image_url || item.image || (prod ? prod.image : "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600");
  const descVal = item.description || (prod ? prod.description : "No description available.");

  return {
    id: itemId,
    name: titleVal,
    brand: brandVal,
    category: catVal,
    price: priceVal,
    rating: ratingVal,
    reviewCount: reviewCountVal,
    image: imageVal,
    description: descVal,
    score: item.score,
    cf_score: item.cf_score,
    cbf_score: item.cbf_score,
    details: {
      "Main Category": brandVal,
      "Category": categoriesList.join(" > "),
      "Product ID": itemId
    }
  };
};

function App() {
  // Navigation State
  // Pages: 'home', 'products', 'search', 'detail', 'cart', 'checkout', 'reviews', 'review-form', 'account-profile', 'account-orders', 'account-reviews', 'login'
  const [currentPage, setCurrentPage] = useState('login');
  
  // Data State
  const productsList = initialProducts;
  const [cartItems, setCartItems] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [userReviewsList, setUserReviewsList] = useState([]);
  const [productReviews, setProductReviews] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('aura-studio-anc');
  const [reviewFormProductId, setReviewFormProductId] = useState('aura-studio-anc');
  const [user, setUser] = useState(null);

  // Registration and Login states
  const [regId, setRegId] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginTab, setLoginTab] = useState('login');
  const [selectedLoginUserId, setSelectedLoginUserId] = useState('');

  // Form State
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  
  // Filter States (All Products & Search Pages)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('headphones'); // default term from screenshot
  const [activeCategory, setActiveCategory] = useState('All');
  const [priceRange, setPriceRange] = useState(1000);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [sortBy, setSortBy] = useState('featured');
  const [currentPageNum, setCurrentPageNum] = useState(1);
  
  // Recommender API Integration State
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const [apiOnline, setApiOnline] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]); // Home Page
  const [visibleRecsCount, setVisibleRecsCount] = useState(8);
  const [similarItems, setSimilarItems] = useState([]); // Product Detail
  const [apiSearchItems, setApiSearchItems] = useState([]); // Search similarity
  const similarSource = 'cbf'; // 'cbf' or 'cf' for item similarity
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [apiProducts, setApiProducts] = useState([]);
  const [apiTotalProducts, setApiTotalProducts] = useState(0);
  const [apiProductsLoading, setApiProductsLoading] = useState(false);
  const [dbUsers, setDbUsers] = useState([]);

  // Toast Overlay State
  const [toast, setToast] = useState(null);

  const triggerToast = (message, icon = 'check') => {
    setToast({ message, icon });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper to log user click, search, cart, order, and review interactions to backend for profile updates
  const logUserEvent = async (eventType, parentAsin = null, details = null) => {
    if (!apiOnline || !user || !user.id) return;
    try {
      await fetch(`${apiUrl}/user/${user.id}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          parent_asin: parentAsin,
          details: details
        })
      });
    } catch (e) {
      console.log(`Failed to log ${eventType} event:`, e);
    }
  };

  const fetchCart = async () => {
    if (!user || !user.id) return;
    if (!apiOnline) {
      setCartItems([]);
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/cart`);
      if (res.ok) {
        const data = await res.json();
        setCartItems(data.cart || []);
      }
    } catch (err) {
      console.error("Failed to fetch cart:", err);
    }
  };

  const fetchOrders = async () => {
    if (!user || !user.id) return;
    if (!apiOnline) {
      setOrdersList([]);
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrdersList(data.orders || []);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  };

  const fetchUserReviews = async () => {
    if (!user || !user.id) return;
    if (!apiOnline) {
      setUserReviewsList([]);
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setUserReviewsList(data.reviews || []);
      }
    } catch (err) {
      console.error("Failed to fetch user reviews:", err);
    }
  };

  // Synchronize dynamic databases data with state on user/api switches
  useEffect(() => {
    if (user && user.id) {
      fetchCart();
      fetchOrders();
      fetchUserReviews();
    } else {
      setCartItems([]);
      setOrdersList([]);
      setUserReviewsList([]);
    }
  }, [user?.id, apiOnline, apiUrl]);

  // Check backend API status & stats
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${apiUrl}/health`);
        if (res.ok) {
          const data = await res.json();
          setApiOnline(data.status === 'ok');
        } else {
          setApiOnline(false);
        }
      } catch {
        setApiOnline(false);
      }
    };
    
    checkApi();
    const interval = setInterval(checkApi, 10000); // check health every 10s
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Restore active user session from Redis on load if session token exists
  useEffect(() => {
    if (!apiOnline) {
      setCurrentPage('login');
      return;
    }
    const restoreSession = async () => {
      const storedToken = localStorage.getItem("session_token");
      if (!storedToken) {
        setCurrentPage('login');
        return;
      }
      try {
        const res = await fetch(`${apiUrl}/session?token=${storedToken}`);
        if (res.ok) {
          const data = await res.json();
          setUser({
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            fullName: data.user.name,
            token: storedToken
          });
          triggerToast(`Restored active session for ${data.user.name}.`);
          setCurrentPage('home');
        } else {
          setCurrentPage('login');
        }
      } catch (err) {
        console.log("Failed to restore session:", err);
        setCurrentPage('login');
      }
    };
    restoreSession();
  }, [apiOnline, apiUrl]);

  // Fetch actual users list from database for simulation dropdown
  useEffect(() => {
    if (!apiOnline) return;
    const fetchDbUsers = async () => {
      try {
        const res = await fetch(`${apiUrl}/users?limit=30`);
        if (res.ok) {
          const data = await res.json();
            const filtered = data.users.filter(u => u.id !== '1234567890' && u.id !== '9876543210' && u.id !== '5554443332');
            const finalUsers = filtered.length > 0 ? filtered : data.users;
            setDbUsers(finalUsers);
            if (finalUsers.length > 0) {
              setSelectedLoginUserId(finalUsers[0].id);
            } else {
              setSelectedLoginUserId('');
            }
        }
      } catch (err) {
        console.error("Failed to fetch database users:", err);
      }
    };
    fetchDbUsers();
  }, [apiOnline, apiUrl]);

  // Fetch Recommendations on user ID, API status change, or onboarding completion
  useEffect(() => {
    if (!user || !user.id) return;
    if (!apiOnline) {
      // Mock local recommendations based on styling picks
      const mockRecs = productsList
        .filter(p => p.id === 'aura-studio-anc' || p.id === 'lumina-ambient-hub' || p.id === 'kanso-ceramic-vase' || p.id === 'oak-silhouette-chair')
        .map(p => ({
          ...p,
          score: 0.95,
          cf_score: 0.88,
          cbf_score: 0.98
        }));
      setTimeout(() => setRecommendations(mockRecs), 0);
      return;
    }

    const fetchRecs = async () => {
      setRecsLoading(true);
      try {
        const res = await fetch(`${apiUrl}/recommend/${user.id}?k=30`);
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            const mapped = data.items.map(item => mapApiProduct(item, productsList));
            setRecommendations(mapped);
          }
        }
      } catch (err) {
        console.error("Failed to fetch recommendations:", err);
      } finally {
        setRecsLoading(false);
      }
    };

    fetchRecs();
  }, [apiOnline, user?.id, productsList, apiUrl]);

  // Handle vertical lazy loading (infinite scroll) for recommendations
  useEffect(() => {
    if (currentPage !== 'home') return;
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 150) {
        setVisibleRecsCount(prev => Math.min(prev + 8, recommendations.length));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentPage, recommendations.length]);

  // Reset visible recommendations count when active user profile changes
  useEffect(() => {
    if (user && user.id) {
      setTimeout(() => setVisibleRecsCount(8), 0);
    }
  }, [user?.id]);

  // Reset detail quantity when product changes
  useEffect(() => {
    setDetailQuantity(1);
  }, [selectedProductId]);

  // Fetch Similar Items when selected product or similarity source changes
  useEffect(() => {
    if (!apiOnline) {
      // Mock similar items locally by category
      const current = productsList.find(p => p.id === selectedProductId) || productsList[0];
      const mockSim = productsList
        .filter(p => p.id !== selectedProductId && (p.category === current.category || p.brand === current.brand))
        .slice(0, 3)
        .map(p => ({
          ...p,
          score: 0.82
        }));
      setTimeout(() => setSimilarItems(mockSim), 0);
      return;
    }

    const fetchSimilar = async () => {
      try {
        const res = await fetch(`${apiUrl}/similar/${selectedProductId}?k=3&source=cbf`);
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            const mapped = data.items.map(item => mapApiProduct(item, productsList));
            setSimilarItems(mapped);
          }
        }
      } catch (err) {
        console.error("Failed to fetch similar items:", err);
      }
    };

    fetchSimilar();
  }, [apiOnline, selectedProductId, similarSource, productsList, apiUrl]);

  // Fetch Text Search results when search query is updated
  useEffect(() => {
    if (!searchFilter) return;
    
    if (!apiOnline) {
      // Local keyword matching
      const query = searchFilter.toLowerCase();
      const filtered = productsList.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.brand.toLowerCase().includes(query) || 
        p.category.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
      setTimeout(() => setApiSearchItems(filtered), 0);
      return;
    }

    const fetchSearchSimilarity = async () => {
      try {
        const res = await fetch(`${apiUrl}/similar_by_text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchFilter, k: 12 })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            const mapped = data.items.map(item => mapApiProduct(item, productsList));
            setApiSearchItems(mapped);
          }
        }
      } catch (err) {
        console.error("Failed to fetch text similar items:", err);
      }
    };

    fetchSearchSimilarity();
  }, [apiOnline, searchFilter, productsList, apiUrl]);

  // Fetch dynamic catalog products when on products page
  useEffect(() => {
    if (!apiOnline || currentPage !== 'products') return;

    const fetchCatalogProducts = async () => {
      setApiProductsLoading(true);
      try {
        const catParam = activeCategory === 'All' ? '' : activeCategory;
        const res = await fetch(`${apiUrl}/products?page=${currentPageNum}&limit=12&category=${catParam}`);
        if (res.ok) {
          const data = await res.json();
          if (data.items) {
            const mapped = data.items.map(item => mapApiProduct(item, productsList));
            setApiProducts(mapped);
            setApiTotalProducts(data.total);
          }
        }
      } catch (err) {
        console.error("Failed to fetch catalog products:", err);
      } finally {
        setApiProductsLoading(false);
      }
    };

    fetchCatalogProducts();
  }, [apiOnline, currentPage, currentPageNum, activeCategory, apiUrl, productsList]);

  // Fetch product detail dynamically when selectedProductId changes
  useEffect(() => {
    if (!selectedProductId) return;

    if (!apiOnline) {
      const local = productsList.find(p => p.id === selectedProductId) || productsList[0];
      setTimeout(() => setSelectedProduct(local), 0);
      return;
    }

    const fetchDetail = async () => {
      try {
        const res = await fetch(`${apiUrl}/products/${selectedProductId}`);
        if (res.ok) {
          const item = await res.json();
          const mapped = mapApiProduct(item, productsList);
          setSelectedProduct(mapped);
        } else {
          // Fallback to local search in existing arrays
          const allLoaded = [...recommendations, ...similarItems, ...apiSearchItems, ...apiProducts];
          const found = allLoaded.find(p => p.id === selectedProductId) || productsList.find(p => p.id === selectedProductId) || productsList[0];
          setSelectedProduct(found);
        }
      } catch (err) {
        console.error("Failed to fetch product details:", err);
        const allLoaded = [...recommendations, ...similarItems, ...apiSearchItems, ...apiProducts];
        const found = allLoaded.find(p => p.id === selectedProductId) || productsList.find(p => p.id === selectedProductId) || productsList[0];
        setSelectedProduct(found);
      }
    };

    fetchDetail();
  }, [selectedProductId, apiOnline, apiUrl, productsList, recommendations, similarItems, apiSearchItems, apiProducts]);

  // Fetch reviews for the selected product dynamically
  useEffect(() => {
    if (!selectedProductId) return;
    const fetchProductReviews = async () => {
      if (!apiOnline) {
        setProductReviews([]);
        return;
      }
      try {
        const res = await fetch(`${apiUrl}/products/${selectedProductId}/reviews`);
        if (res.ok) {
          const data = await res.json();
          setProductReviews(data.reviews || []);
        }
      } catch (err) {
        console.error("Failed to fetch product reviews:", err);
      }
    };
    fetchProductReviews();
  }, [selectedProductId, apiOnline, apiUrl]);



  const handleLogin = async (e) => {
    e.preventDefault();
    const userIdToLogin = selectedLoginUserId || (dbUsers.length > 0 ? dbUsers[0].id : "1234567890");
    const selectedDbUser = dbUsers.find(u => u.id === userIdToLogin) || dbUsers[0];
    const email = selectedDbUser ? selectedDbUser.email : 'agung@example.com';
    const nameVal = selectedDbUser ? selectedDbUser.name.split(' (')[0] : 'Agung Pradana';
    
    if (!apiOnline) {
      setUser({
        id: userIdToLogin,
        username: email.split('@')[0],
        email: email,
        fullName: nameVal
      });
      triggerToast(`Offline Login: Switched to user ID: ${userIdToLogin}`);
      setCurrentPage('home');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password' })
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          fullName: data.user.name,
          token: data.token
        });
        localStorage.setItem("session_token", data.token);
        triggerToast(`Session established for: ${data.user.name}`);
        setCurrentPage('home');
      } else {
        setUser({
          id: userIdToLogin,
          username: email.split('@')[0],
          email: email,
          fullName: nameVal
        });
        triggerToast(`Logged in locally: ${nameVal}`);
        setCurrentPage('home');
      }
    } catch (err) {
      console.error("Login failed:", err);
      setUser({
        id: userIdToLogin,
        username: email.split('@')[0],
        email: email,
        fullName: nameVal
      });
      triggerToast(`Logged in locally: ${nameVal}`);
      setCurrentPage('home');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regId || !regName || !regEmail) {
      alert("Please fill in all fields.");
      return;
    }

    if (!apiOnline) {
      triggerToast("API Offline. Cannot register a new user in the database.");
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: regId,
          name: regName,
          email: regEmail,
          password: regPassword
        })
      });

      if (res.ok) {
        const regData = await res.json();
        triggerToast("Registration successful! Logging in...");
        
        const logRes = await fetch(`${apiUrl}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: regEmail, password: regPassword })
        });

        if (logRes.ok) {
          const data = await logRes.json();
          setUser({
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            fullName: data.user.name,
            token: data.token
          });
          localStorage.setItem("session_token", data.token);
          triggerToast(`Session established for: ${data.user.name}`);
          setCurrentPage('home');
        } else {
          setUser({
            id: regData.user.id,
            username: regData.user.username,
            email: regData.user.email,
            fullName: regData.user.name
          });
          setCurrentPage('home');
        }
        
        const fetchUsersRes = await fetch(`${apiUrl}/users?limit=30`);
        if (fetchUsersRes.ok) {
          const uData = await fetchUsersRes.json();
          if (uData.users) {
            const filtered = uData.users.filter(u => u.id !== '1234567890' && u.id !== '9876543210' && u.id !== '5554443332');
            setDbUsers(filtered);
          }
        }
      } else {
        const errData = await res.json();
        alert(`Registration failed: ${errData.detail || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Registration request failed:", err);
      alert("Failed to connect to the backend server for registration.");
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchFilter(searchQuery);
      setCurrentPage('search');
      
      // Track user search inputs for cold-start profile vectoring
      logUserEvent('search', null, searchQuery);
    }
  };

  const viewProductDetail = (productId) => {
    setSelectedProductId(productId);
    setCurrentPage('detail');
    window.scrollTo(0, 0);
    
    // Track user clicks on items for real-time user profiles
    logUserEvent('click', productId);
  };

  // Cart operations
  const addToCart = async (product, quantity = 1) => {
    if (!user || !user.id) return;
    if (!apiOnline) {
      triggerToast("API Offline. Cannot add to cart.");
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, quantity })
      });
      if (res.ok) {
        triggerToast(`Added ${product.name} to cart.`);
        fetchCart();
      }
    } catch (err) {
      console.error("Failed to add to cart:", err);
    }
  };

  const removeFromCart = async (id) => {
    if (!apiOnline) return;
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/cart/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        triggerToast("Item removed from cart.", "trash");
        fetchCart();
      }
    } catch (err) {
      console.error("Failed to remove from cart:", err);
    }
  };

  const updateCartQuantity = async (id, delta) => {
    if (!apiOnline) return;
    const item = cartItems.find(it => it.id === id);
    if (!item) return;
    const newQty = item.quantity + delta;
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/cart/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty })
      });
      if (res.ok) {
        fetchCart();
      }
    } catch (err) {
      console.error("Failed to update cart:", err);
    }
  };

  const calculateSubtotal = () => {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const handlePlaceOrder = async () => {
    if (!apiOnline || cartItems.length === 0) return;
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/checkout`, {
        method: 'POST'
      });
      if (res.ok) {
        triggerToast("Order placed successfully!", "lock");
        fetchCart();
        fetchOrders();
        setCurrentPage('account-orders');
      }
    } catch (err) {
      console.error("Checkout failed:", err);
    }
  };

  // Review Operations
  const handleWriteReviewClick = (productId) => {
    const existing = userReviewsList.find(r => r.productId === productId);
    if (existing) {
      triggerToast("You have already reviewed this product. Delete your existing review to write a new one.", "info");
      return;
    }
    setReviewFormProductId(productId);
    setEditingReviewId(null);
    setReviewTitle('');
    setReviewText('');
    setReviewRating(0);
    setCurrentPage('review-form');
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (reviewRating === 0) {
      alert("Please select a rating.");
      return;
    }
    
    if (!apiOnline) {
      triggerToast("API Offline. Cannot submit review.");
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/products/${reviewFormProductId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          rating: reviewRating,
          title: reviewTitle,
          text: reviewText
        })
      });
      if (res.ok) {
        triggerToast("Review submitted successfully.");
        fetchUserReviews();
        // If viewing this product detail, refresh its reviews
        if (selectedProductId === reviewFormProductId) {
          const rRes = await fetch(`${apiUrl}/products/${selectedProductId}/reviews`);
          if (rRes.ok) {
            const rData = await rRes.json();
            setProductReviews(rData.reviews || []);
          }
        }
        setCurrentPage('account-profile'); // Redirecting to profile page
      }
    } catch (err) {
      console.error("Failed to submit review:", err);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!apiOnline) return;
    try {
      const res = await fetch(`${apiUrl}/user/${user.id}/reviews/${reviewId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        triggerToast("Review deleted.", "trash");
        fetchUserReviews();
        // If viewing this product detail, refresh its reviews
        if (selectedProductId) {
          const rRes = await fetch(`${apiUrl}/products/${selectedProductId}/reviews`);
          if (rRes.ok) {
            const rData = await rRes.json();
            setProductReviews(rData.reviews || []);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete review:", err);
    }
  };

  // Helper for rendering rating stars
  const renderStars = (rating) => {
    const stars = [];
    const floor = Math.floor(rating);
    const hasHalf = rating - floor >= 0.5;
    for (let i = 1; i <= 5; i++) {
      if (i <= floor) {
        stars.push(<Star key={i} size={15} className="rating-star-icon" />);
      } else if (i === floor + 1 && hasHalf) {
        stars.push(<Star key={i} size={15} className="rating-star-icon" style={{ opacity: 0.7 }} />);
      } else {
        stars.push(<Star key={i} size={15} className="text-gray-300" style={{ color: '#e2e8f0' }} />);
      }
    }
    return stars;
  };

  // Filtering products for Search / Catalog list
  const getFilteredProducts = () => {
    let list = productsList;
    if (apiOnline) {
      if (currentPage === 'search') {
        list = apiSearchItems;
      } else if (currentPage === 'products') {
        list = apiProducts;
      }
    }

    if (activeCategory !== 'All' && (!apiOnline || currentPage === 'search')) {
      list = list.filter(p => p.category.toLowerCase() === activeCategory.toLowerCase());
    }

    list = list.filter(p => p.price <= priceRange);

    if (ratingFilter > 0) {
      list = list.filter(p => p.rating >= ratingFilter);
    }

    // Sort
    if (sortBy === 'price-low') {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      list = [...list].sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => b.rating - a.rating);
    }

    return list;
  };

  const filteredProducts = getFilteredProducts();

  return (
    <div id="root">
      
      {/* Cold Start Onboarding Modal */}
      {/* Onboarding Modal removed */}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          {toast.icon === 'trash' ? <Trash2 size={16} /> : toast.icon === 'lock' ? <Lock size={16} /> : <Check size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      {user ? (
        <header className="header-wrapper">
          <div className="header-container">
            <div className="logo" onClick={() => setCurrentPage('home')}>
              <Layers size={22} />
              <span>E-commerce</span>
            </div>

            {/* Search bar inside header */}
            <form onSubmit={handleSearchSubmit} className="search-bar-container">
              <Search size={18} className="search-icon-inside" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>

            <div className="header-actions">
              <button className="action-btn" onClick={() => setCurrentPage('account-profile')} title="My Profile">
                <User size={20} />
              </button>
              <button className="action-btn" onClick={() => setCurrentPage('account-orders')} title="Transaction History">
                <FileText size={20} />
              </button>
              <button className="action-btn" onClick={() => setCurrentPage('cart')} title="Shopping Cart">
                <ShoppingCart size={20} />
                {cartItems.length > 0 && (
                  <span className="badge">
                    {cartItems.reduce((acc, it) => acc + it.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="header-wrapper" style={{ borderBottom: '1px solid var(--border-medium)' }}>
          <div className="header-container" style={{ justifyContent: 'center' }}>
            <div className="logo">
              <Layers size={22} />
              <span>E-commerce Portal</span>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="main-content">

        {/* LOGIN / REGISTER VIEW */}
        {(!user || currentPage === 'login') && (
          <div style={{ maxWidth: '480px', margin: '60px auto' }}>
            <div className="form-box">
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-medium)', marginBottom: '24px' }}>
                <button 
                  type="button"
                  onClick={() => setLoginTab('login')}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    fontWeight: '700', 
                    fontSize: '16px',
                    color: loginTab === 'login' ? 'var(--primary)' : 'var(--text-light)',
                    borderBottom: loginTab === 'login' ? '2px solid var(--primary)' : 'none',
                    textAlign: 'center',
                    backgroundColor: 'transparent'
                  }}
                >
                  Login
                </button>
                <button 
                  type="button"
                  onClick={() => setLoginTab('register')}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    fontWeight: '700', 
                    fontSize: '16px',
                    color: loginTab === 'register' ? 'var(--primary)' : 'var(--text-light)',
                    borderBottom: loginTab === 'register' ? '2px solid var(--primary)' : 'none',
                    textAlign: 'center',
                    backgroundColor: 'transparent'
                  }}
                >
                  Register
                </button>
              </div>

              {loginTab === 'login' ? (
                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="login-user-select">Choose Account to Login</label>
                    <select
                      id="login-user-select"
                      className="form-input"
                      value={selectedLoginUserId}
                      onChange={(e) => setSelectedLoginUserId(e.target.value)}
                      style={{ backgroundColor: 'white', cursor: 'pointer' }}
                      disabled={dbUsers.length === 0}
                    >
                      {dbUsers.length > 0 ? (
                        dbUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} [{u.id}]</option>
                        ))
                      ) : (
                        <option value="">No users found (API Offline/Database Empty)</option>
                      )}
                    </select>
                  </div>
                  <button type="submit" className="form-submit-btn" style={{ marginTop: '12px' }} disabled={dbUsers.length === 0}>
                    Log In
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-id">User ID</label>
                    <input 
                      type="text"
                      id="reg-id"
                      className="form-input"
                      placeholder="User ID"
                      value={regId}
                      onChange={(e) => setRegId(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-name">Full Name</label>
                    <input 
                      type="text"
                      id="reg-name"
                      className="form-input"
                      placeholder="Full Name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-email">Email Address</label>
                    <input 
                      type="email"
                      id="reg-email"
                      className="form-input"
                      placeholder="Email Address"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-pass">Password</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? "text" : "password"}
                        id="reg-pass"
                        className="form-input"
                        placeholder="Password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--text-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                          borderRadius: '4px'
                        }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="form-submit-btn" style={{ marginTop: '12px' }}>
                    Create Account & Login
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* 1. HOME PAGE VIEW */}
        {user && currentPage === 'home' && (
          <div>
            <div className="section-header">
              <div>
                <h1 className="section-title">For You</h1>
                <p className="section-subtitle">Picks based on your style and past interactions.</p>
              </div>
              <button className="view-all-link" onClick={() => setCurrentPage('products')}>
                <span>VIEW ALL</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {recsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: 'var(--primary)' }}>
                <Loader2 className="spinner" size={36} />
              </div>
            ) : (
              <div>
                <div className="product-grid" style={{ marginBottom: '48px' }}>
                  {recommendations.slice(0, visibleRecsCount).map(product => (
                    <div key={product.id} className="product-card">
                      {product.isBestseller && <span className="tag-badge best-seller">Best Seller</span>}
                      {product.isNew && <span className="tag-badge new">New</span>}
                      


                      <div className="product-image-container" onClick={() => viewProductDetail(product.id)} style={{ cursor: 'pointer' }}>
                        <img src={product.image} alt={product.name} className="product-image" />
                      </div>
                      <div className="product-info">
                        <span className="product-brand">{product.brand}</span>
                        <h3 className="product-name" onClick={() => viewProductDetail(product.id)}>{product.name}</h3>
                        <div className="rating-row">
                          <div style={{ display: 'flex' }}>
                            {renderStars(product.rating)}
                          </div>
                          <span>({product.reviewCount})</span>
                        </div>
                        <div className="price-row">
                          <span className="price">${product.price.toFixed(2)}</span>
                          <button 
                            className="add-cart-icon-btn" 
                            onClick={(e) => { e.stopPropagation(); addToCart(product); }} 
                            title="Add to Cart"
                          >
                            <ShoppingCart size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {recommendations.length > 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '24px 0', 
                    borderTop: '1px solid var(--border-light)',
                    marginTop: '20px', 
                    color: 'var(--text-muted)' 
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>
                      Showing {Math.min(visibleRecsCount, recommendations.length)} of {recommendations.length} recommendations
                    </span>
                    {visibleRecsCount < recommendations.length ? (
                      <div style={{ 
                        marginTop: '8px', 
                        fontSize: '12px', 
                        fontWeight: '700', 
                        color: 'var(--accent)',
                        letterSpacing: '0.5px' 
                      }}>
                        SCROLL DOWN TO LAZY LOAD MORE PICKS
                      </div>
                    ) : (
                      <div style={{ 
                        marginTop: '8px', 
                        fontSize: '12px', 
                        fontWeight: '700', 
                        color: 'var(--text-light)',
                        letterSpacing: '0.5px' 
                      }}>
                        ALL RECOMMENDATIONS LOADED
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. CATALOG VIEW & 3. SEARCH VIEW */}
        {user && (currentPage === 'products' || currentPage === 'search') && (
          <div>
            <div className="section-header" style={{ marginBottom: '32px' }}>
              <div>
                <h1 className="section-title">
                  {currentPage === 'search' ? `Search Results` : 'All Products'}
                </h1>
                <p className="section-subtitle">
                  {currentPage === 'search' 
                    ? <span>Found {filteredProducts.length} results for <strong style={{ color: 'var(--primary)', borderBottom: '2px solid' }}>"{searchFilter}"</strong></span>
                    : `Browse our full catalog of premium products.`
                  }
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>Sort by:</span>
                <select 
                  className="reviews-sort-select" 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="rating">Rating</option>
                </select>
              </div>
            </div>

            <div className="layout-with-sidebar">
              
              {/* Sidebar Filters */}
              <aside className="sidebar">
                <div className="filter-section">
                  <h3 className="filter-title">Categories</h3>
                  <div className="checkbox-list">
                    {(apiOnline 
                      ? ['All', 'Grocery', 'Office Products', 'Video Games', 'All Electronics', 'Amazon Home', 'Computers', 'Tools & Home Improvement', 'Industrial & Scientific', 'Health & Personal Care']
                      : ['All', 'Audio', 'Wearables', 'Smart Home', 'Decor', 'Furniture', 'Beauty', 'Accessories']
                    ).map(cat => (
                      <label key={cat} className="checkbox-label">
                        <input 
                          type="radio" 
                          name="category"
                          className="radio-input"
                          checked={activeCategory === cat}
                          onChange={() => setActiveCategory(cat)}
                        />
                        <span>{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="filter-section">
                  <h3 className="filter-title">Price Range</h3>
                  <div className="slider-track">
                    <div className="slider-handle" style={{ left: `${(priceRange / 1000) * 100}%` }}></div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1000" 
                    value={priceRange} 
                    onChange={(e) => setPriceRange(Number(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', opacity: 0.8 }}
                  />
                  <div className="slider-values" style={{ marginTop: '8px' }}>
                    <span>$0</span>
                    <span style={{ fontWeight: '700', color: 'var(--text-dark)' }}>Under ${priceRange}</span>
                    <span>$1000+</span>
                  </div>
                </div>

                <div className="filter-section">
                  <h3 className="filter-title">Rating</h3>
                  <div className="checkbox-list">
                    {[
                      { val: 0, label: 'All Ratings' },
                      { val: 4, label: '4★ & Up' },
                      { val: 3, label: '3★ & Up' }
                    ].map(rat => (
                      <label key={rat.val} className="checkbox-label">
                        <input 
                          type="radio" 
                          name="rating"
                          className="radio-input"
                          checked={ratingFilter === rat.val}
                          onChange={() => setRatingFilter(rat.val)}
                        />
                        <span>{rat.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </aside>

              {/* Products List Grid */}
              <div>
                {apiProductsLoading && currentPage === 'products' ? (
                  <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>Loading products from database...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '80px 0', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>No products match your filters.</p>
                    <button 
                      onClick={() => { setActiveCategory('All'); setPriceRange(1000); setRatingFilter(0); }}
                      style={{ marginTop: '16px', color: 'var(--accent)', fontWeight: '700', textDecoration: 'underline' }}
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="product-grid" style={{ marginTop: 0 }}>
                    {filteredProducts.map(product => (
                      <div key={product.id} className="product-card">
                        {product.isBestseller && <span className="tag-badge best-seller">Best Seller</span>}
                        {product.isNew && <span className="tag-badge new">New</span>}
                        


                        <div className="product-image-container" onClick={() => viewProductDetail(product.id)} style={{ cursor: 'pointer' }}>
                          <img src={product.image} alt={product.name} className="product-image" />
                        </div>
                        <div className="product-info">
                          <span className="product-brand">{product.brand}</span>
                          <h3 className="product-name" onClick={() => viewProductDetail(product.id)}>{product.name}</h3>
                          <div className="rating-row">
                            <div style={{ display: 'flex' }}>
                              {renderStars(product.rating)}
                            </div>
                            <span>({product.reviewCount})</span>
                          </div>
                          <div className="price-row">
                            <span className="price">${product.price.toFixed(2)}</span>
                            <button 
                              className="add-cart-icon-btn" 
                              onClick={(e) => { e.stopPropagation(); addToCart(product); }} 
                              title="Add to Cart"
                            >
                              <ShoppingCart size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                <div className="pagination">
                  <button 
                    className={`page-btn ${currentPageNum === 1 ? 'disabled' : ''}`}
                    onClick={() => currentPageNum > 1 && setCurrentPageNum(currentPageNum - 1)}
                  >
                    &lt;
                  </button>
                  
                  {currentPageNum > 2 && (
                    <button className="page-btn" onClick={() => setCurrentPageNum(1)}>1</button>
                  )}
                  {currentPageNum > 3 && <span style={{ color: 'var(--text-light)', padding: '0 4px' }}>...</span>}
                  
                  {currentPageNum > 1 && (
                    <button className="page-btn" onClick={() => setCurrentPageNum(currentPageNum - 1)}>{currentPageNum - 1}</button>
                  )}
                  
                  <button className="page-btn active">{currentPageNum}</button>
                  
                  {currentPageNum < Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1) && (
                    <button className="page-btn" onClick={() => setCurrentPageNum(currentPageNum + 1)}>{currentPageNum + 1}</button>
                  )}
                  
                  {currentPageNum < Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1) - 2 && (
                    <span style={{ color: 'var(--text-light)', padding: '0 4px' }}>...</span>
                  )}
                  {currentPageNum < Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1) - 1 && (
                    <button className="page-btn" onClick={() => setCurrentPageNum(Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1))}>
                      {Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1)}
                    </button>
                  )}
                  
                  <button 
                    className={`page-btn ${currentPageNum >= Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1) ? 'disabled' : ''}`}
                    onClick={() => currentPageNum < Math.max(Math.ceil((apiOnline ? apiTotalProducts : productsList.length) / 12), 1) && setCurrentPageNum(currentPageNum + 1)}
                  >
                    &gt;
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 4. PRODUCT DETAIL VIEW */}
        {user && currentPage === 'detail' && (() => {
          const product = selectedProduct || productsList[0];
          
          return (
            <div>
              {/* Breadcrumbs */}
              <div style={{ 
                fontSize: '13px', 
                color: 'var(--text-muted)', 
                marginBottom: '32px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ cursor: 'pointer' }} onClick={() => setCurrentPage('home')}>Home</span>
                <ChevronRight size={12} />
                <span style={{ cursor: 'pointer' }} onClick={() => { setActiveCategory(product.category); setCurrentPage('products'); }}>{product.category}</span>
                <ChevronRight size={12} />
                <span style={{ color: 'var(--text-dark)', fontWeight: '600' }}>{product.name}</span>
              </div>

              <div className="detail-container">
                
                {/* Left: Gallery */}
                <div className="detail-gallery">
                  <div className="detail-main-img-container">
                    <img src={product.image} alt={product.name} className="detail-main-img" />
                    {product.isNew && <span className="tag-badge new" style={{ top: '20px', left: '20px' }}>New Arrival</span>}
                  </div>

                </div>

                {/* Right: Meta Details */}
                <div className="detail-meta">
                  <span className="detail-brand">{product.brand}</span>
                  <h1 className="detail-name">{product.name}</h1>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex' }}>
                      {renderStars(product.rating)}
                    </div>
                    <span 
                      style={{ fontSize: '14px', color: 'var(--primary)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setCurrentPage('reviews')}
                    >
                      {product.rating} ({product.reviewCount} Reviews)
                    </span>
                  </div>

                  <div className="detail-price">${product.price.toFixed(2)}</div>
                  <p className="detail-desc">{product.description}</p>

                  <table className="detail-specs-table" style={{ marginBottom: '20px' }}>
                    <tbody>
                      {product.details ? (
                        Object.entries(product.details).map(([key, val]) => (
                          <tr key={key}>
                            <td>{key}:</td>
                            <td>{val}</td>
                          </tr>
                        ))
                      ) : (
                        <>
                          <tr>
                            <td>Color:</td>
                            <td>Standard</td>
                          </tr>
                          <tr>
                            <td>Material:</td>
                            <td>Premium Grade</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  <div className="detail-actions">
                    <div className="quantity-selector">
                      <button 
                        className="qty-btn" 
                        onClick={() => setDetailQuantity(prev => Math.max(1, prev - 1))}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="qty-value">{detailQuantity}</span>
                      <button 
                        className="qty-btn" 
                        onClick={() => setDetailQuantity(prev => prev + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button 
                      className="add-bag-btn" 
                      onClick={() => addToCart(product, detailQuantity)}
                    >
                      <ShoppingCart size={18} />
                      <span>Add to Cart</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Related Products: You May Also Like */}
              <div style={{ borderTop: '1px solid var(--border-medium)', paddingTop: '48px', marginTop: '64px' }}>
                <div className="section-header">
                  <div>
                    <h2 className="section-title" style={{ fontSize: '22px' }}>You May Also Like</h2>
                    <p className="section-subtitle">Similar items you might be interested in.</p>
                  </div>
                </div>

                <div className="product-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                  {similarItems.map(prod => (
                    <div key={prod.id} className="product-card">
                      {prod.score && (
                        <div style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          backgroundColor: 'rgba(30, 58, 138, 0.9)',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          zIndex: 10
                        }}>
                          <span>Similarity: {prod.score.toFixed(3)}</span>
                        </div>
                      )}
                      <div className="product-image-container" onClick={() => viewProductDetail(prod.id)} style={{ cursor: 'pointer' }}>
                        <img src={prod.image} alt={prod.name} className="product-image" />
                      </div>
                      <div className="product-info">
                        <span className="product-brand">{prod.brand}</span>
                        <h3 className="product-name" onClick={() => viewProductDetail(prod.id)}>{prod.name}</h3>
                        <div className="price-row">
                          <span className="price">${prod.price.toFixed(2)}</span>
                          <button 
                            className="add-cart-icon-btn" 
                            onClick={(e) => { e.stopPropagation(); addToCart(prod); }} 
                            title="Add to Cart"
                          >
                            <ShoppingCart size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Shopping Cart View */}
        {user && currentPage === 'cart' && (
          <div>
            <h1 className="section-title" style={{ marginBottom: '32px' }}>Shopping Cart</h1>
            {cartItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <ShoppingCart size={48} style={{ color: 'var(--text-light)', marginBottom: '16px' }} />
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>Your cart is empty.</p>
                <button 
                  onClick={() => setCurrentPage('home')}
                  style={{ marginTop: '16px', backgroundColor: 'var(--text-dark)', color: 'white', padding: '10px 24px', borderRadius: '6px', fontWeight: '700' }}
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-items-list">
                  {cartItems.map(item => (
                    <div key={item.id} className="cart-item-row">
                      <div className="cart-item-img-container">
                        <img src={item.image} alt={item.name} className="cart-item-img" />
                      </div>
                      <div className="cart-item-details">
                        <h3 className="cart-item-name" style={{ cursor: 'pointer' }} onClick={() => viewProductDetail(item.id)}>{item.name}</h3>
                        <div className="cart-item-option">{item.option}</div>
                        <div className="cart-item-actions">
                          <span className="cart-action-link remove" onClick={() => removeFromCart(item.id)}>Remove</span>
                        </div>
                      </div>
                      <div className="cart-item-price-col">
                        <span className="cart-item-price">${(item.price * item.quantity).toFixed(2)}</span>
                        <div className="quantity-selector" style={{ marginTop: '8px' }}>
                          <button className="qty-btn" onClick={() => updateCartQuantity(item.id, -1)} disabled={item.quantity <= 1}>
                            <Minus size={12} />
                          </button>
                          <span className="qty-value">{item.quantity}</span>
                          <button className="qty-btn" onClick={() => updateCartQuantity(item.id, 1)}>
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="summary-box">
                  <h3 className="summary-title">Order Summary</h3>
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>${calculateSubtotal().toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="summary-row">
                    <span>Estimated Tax (10%)</span>
                    <span>${(calculateSubtotal() * 0.1).toFixed(2)}</span>
                  </div>
                  <div className="summary-row total">
                    <span>Total</span>
                    <span>${(calculateSubtotal() * 1.1).toFixed(2)}</span>
                  </div>
                  <button className="checkout-btn" onClick={() => setCurrentPage('checkout')}>
                    <span>Proceed to Checkout</span>
                    <ArrowRight size={16} />
                  </button>
                  <div className="secure-note">
                    <Lock size={12} />
                    <span>Secure Checkout</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Checkout View */}
        {user && currentPage === 'checkout' && (
          <div className="checkout-layout">
            <h1 className="section-title" style={{ marginBottom: '32px', textAlign: 'center' }}>Checkout</h1>
            <div className="summary-box" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 className="summary-title">Review Your Order</h3>
              
              <div className="checkout-summary-list">
                {cartItems.map(item => (
                  <div key={item.id} className="checkout-summary-item">
                    <img src={item.image} alt={item.name} className="checkout-item-img" />
                    <div className="checkout-item-details">
                      <h4 className="checkout-item-name">{item.name}</h4>
                      <span className="checkout-item-opt">Qty: {item.quantity}</span>
                    </div>
                    <span className="checkout-item-price">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="summary-row">
                <span>Subtotal</span>
                <span>${calculateSubtotal().toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="summary-row">
                <span>Tax (10%)</span>
                <span>${(calculateSubtotal() * 0.1).toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Order Total</span>
                <span>${(calculateSubtotal() * 1.1).toFixed(2)}</span>
              </div>

              <button className="checkout-btn" onClick={handlePlaceOrder} style={{ marginTop: '24px' }}>
                <Lock size={16} />
                <span>Place Order Now</span>
              </button>
              
              <button 
                className="promo-btn" 
                onClick={() => setCurrentPage('cart')} 
                style={{ width: '100%', marginTop: '12px', border: '1px solid var(--border-medium)', backgroundColor: 'transparent' }}
              >
                Back to Cart
              </button>
            </div>
          </div>
        )}

        {/* Customer Reviews View */}
        {user && currentPage === 'reviews' && (() => {
          const product = selectedProduct || productsList[0];
          
          const distribution = [0, 0, 0, 0, 0];
          productReviews.forEach(r => {
            const idx = Math.max(1, Math.min(5, Math.floor(r.rating)));
            distribution[5 - idx]++;
          });
          const totalDist = productReviews.length || 1;

          return (
            <div>
              <button 
                onClick={() => setCurrentPage('detail')}
                className="view-all-link"
                style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '700' }}
              >
                <ArrowLeft size={16} />
                <span>BACK TO PRODUCT</span>
              </button>

              <div className="section-header" style={{ marginBottom: '32px' }}>
                <div>
                  <h1 className="section-title">Customer Reviews</h1>
                  <p className="section-subtitle">Read what other readers have to say.</p>
                </div>
              </div>

              <div className="form-product-info" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-light)', marginBottom: '32px' }}>
                <img src={product.image} alt={product.name} className="form-product-img" />
                <div>
                  <span className="form-product-brand">{product.brand}</span>
                  <h3 className="form-product-name">{product.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex' }}>
                      {renderStars(product.rating)}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>
                      {product.rating} out of 5 stars ({product.reviewCount} ratings)
                    </span>
                  </div>
                </div>
              </div>

              <div className="review-stats-grid">
                <div className="review-stat-box">
                  <span className="review-avg-score">{product.rating}</span>
                  <div style={{ display: 'flex', margin: '8px 0' }}>
                    {renderStars(product.rating)}
                  </div>
                  <span className="review-avg-desc">Average Rating</span>
                </div>

                <div className="review-stat-box" style={{ alignItems: 'stretch' }}>
                  <div className="distribution-list">
                    {[5, 4, 3, 2, 1].map((stars, idx) => {
                      const count = distribution[idx];
                      const pct = Math.round((count / totalDist) * 100);
                      return (
                        <div key={stars} className="distribution-row">
                          <span className="dist-stars">{stars} star</span>
                          <div className="dist-bar-bg">
                            <div className="dist-bar-fill" style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="dist-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="review-stat-box">
                  <div className="review-write-prompt">
                    <p>Have you purchased this item? Share your thoughts with other customers.</p>
                    <button className="write-review-btn" onClick={() => handleWriteReviewClick(product.id)}>
                      Write a Customer Review
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="reviews-header-bar">
                  <span className="reviews-count-text">All Reviews ({productReviews.length})</span>
                </div>

                {productReviews.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>No reviews yet. Be the first to write a review!</p>
                  </div>
                ) : (
                  productReviews.map(review => (
                    <div key={review.id} className="review-card">
                      <div className="review-author-panel">
                        <div className="author-avatar">{review.initial}</div>
                        <span className="author-name">{review.author}</span>
                        <span className="review-date">{review.date}</span>
                      </div>
                      <div className="review-content-panel">
                        <div className="review-rating-row">
                          {renderStars(review.rating)}
                        </div>
                        <h4 className="review-title">{review.title}</h4>
                        <p className="review-text">{review.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

        {/* Review Form View */}
        {user && currentPage === 'review-form' && (() => {
          const product = productsList.find(p => p.id === reviewFormProductId) || selectedProduct || productsList[0];
          return (
            <div>
              <h1 className="section-title" style={{ marginBottom: '32px', textAlign: 'center' }}>
                Create Review
              </h1>

              <div className="form-box">
                <div className="form-product-info">
                  <img src={product.image} alt={product.name} className="form-product-img" />
                  <div>
                    <span className="form-product-brand">{product.brand}</span>
                    <h4 className="form-product-name">{product.name}</h4>
                  </div>
                </div>

                <form onSubmit={submitReview}>
                  <div className="form-group">
                    <label className="form-label">Overall Rating</label>
                    <div className="star-input-row">
                      {[1, 2, 3, 4, 5].map(val => (
                        <button
                          key={val}
                          type="button"
                          className={`star-input-btn ${reviewRating >= val ? 'active' : ''}`}
                          onClick={() => setReviewRating(val)}
                          style={{ fontSize: '24px' }}
                        >
                          <Star size={24} style={{ fill: reviewRating >= val ? 'var(--accent-gold)' : 'none', color: reviewRating >= val ? 'var(--accent-gold)' : 'var(--border-dark)' }} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="review-title">Review Title</label>
                    <input
                      type="text"
                      id="review-title"
                      className="form-input"
                      placeholder="Summarize your experience..."
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="review-text">Review Content</label>
                    <textarea
                      id="review-text"
                      className="form-textarea"
                      placeholder="Write your comments here..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      required
                    ></textarea>
                  </div>

                  <button type="submit" className="form-submit-btn">
                    Submit Review
                  </button>

                  <button
                    type="button"
                    className="promo-btn"
                    onClick={() => setCurrentPage('detail')}
                    style={{ width: '100%', marginTop: '12px', border: '1px solid var(--border-medium)', backgroundColor: 'transparent' }}
                  >
                    Cancel
                  </button>
                </form>
              </div>
            </div>
          );
        })()}

        {/* 9, 10, 11. PROFILE / MY ACCOUNT VIEWS */}
        {user && currentPage.startsWith('account-') && (
          <div>
            <h1 className="section-title" style={{ marginBottom: '32px' }}>My Account</h1>

            <div className="layout-with-sidebar">
              {/* Account Sidebar Navigation */}
              <aside className="sidebar" style={{ padding: '16px' }}>
                <div className="menu-list">
                  <button 
                    className={`menu-item ${currentPage === 'account-profile' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('account-profile')}
                  >
                    <User size={18} />
                    <span>Profile</span>
                  </button>

                  <button 
                    className={`menu-item ${currentPage === 'account-orders' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('account-orders')}
                  >
                    <FileText size={18} />
                    <span>Order History</span>
                  </button>

                  <button 
                    className={`menu-item ${currentPage === 'account-reviews' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('account-reviews')}
                  >
                    <Star size={18} />
                    <span>Review History</span>
                  </button>
                  
                  <button 
                    className="menu-item sign-out"
                    onClick={async () => {
                      const storedToken = localStorage.getItem("session_token");
                      if (storedToken && apiOnline) {
                        try {
                          await fetch(`${apiUrl}/logout`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: storedToken })
                          });
                        } catch (err) {
                          console.log("Logout request failed:", err);
                        }
                      }
                      localStorage.removeItem("session_token");
                      setUser(null);
                      triggerToast("Signed out. Session cleared.");
                      setCurrentPage('login');
                    }}
                  >
                    <X size={18} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </aside>

              {/* Account Views Details Panel */}
              <div style={{ flex: 1 }}>
                             {/* 9. Profile View */}
                {currentPage === 'account-profile' && user && (
                  <div>
                    <h2 className="section-title" style={{ fontSize: '20px', marginBottom: '20px' }}>Profile</h2>
                    
                    <div className="profile-box">
                      <div className="profile-field-group">
                        <div className="profile-field-label">User ID :</div>
                        <div className="profile-field-value" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>{user.id}</div>
                      </div>
                      
                      <div className="profile-field-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
                        <div className="profile-field-label">Username</div>
                        <div className="profile-field-value">{user.username}</div>
                        <div className="profile-field-sub">{user.fullName}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 10. Order History View */}
                {currentPage === 'account-orders' && (
                  <div>
                    <h2 className="section-title" style={{ fontSize: '20px', marginBottom: '20px' }}>Order History</h2>
                    {ordersList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 0', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>You have not placed any orders yet.</p>
                      </div>
                    ) : (
                      <div className="orders-list">
                        {ordersList.map(order => (
                          <div key={order.id} className="order-history-card">
                            <img src={order.image} alt={order.productName} className="order-img" />
                            <div className="order-info">
                              <span className="order-number">Order: {order.id}</span>
                              <h3 className="order-title">{order.productName}</h3>
                              <span className="order-date">{order.date}</span>
                            </div>
                            <div className="order-price-action">
                              <span className="order-price">${order.price.toFixed(2)}</span>
                              <span style={{ 
                                fontSize: '12px', 
                                fontWeight: '700', 
                                padding: '4px 8px', 
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                backgroundColor: order.status === 'Processing' ? 'var(--primary-light)' : '#f1f5f9',
                                color: order.status === 'Processing' ? 'var(--primary)' : 'var(--text-muted)'
                              }}>{order.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 11. Review History View */}
                {currentPage === 'account-reviews' && (
                  <div>
                    <h2 className="section-title" style={{ fontSize: '20px', marginBottom: '20px' }}>Your Reviews</h2>
                    {userReviewsList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 0', backgroundColor: 'white', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                        <p style={{ color: 'var(--text-muted)', fontWeight: '600' }}>You have not written any reviews yet.</p>
                      </div>
                    ) : (
                      <div className="review-history-list">
                        {userReviewsList.map(review => (
                          <div key={review.id} className="user-review-card">
                            <div className="user-review-header">
                              <img src={review.image} alt={review.productName} className="user-review-prod-img" />
                              <div className="user-review-prod-info">
                                <span className="user-review-prod-cat">{review.category}</span>
                                <h4 className="user-review-prod-name">{review.productName}</h4>
                              </div>
                            </div>
                            <div className="review-content-panel" style={{ paddingLeft: 0 }}>
                              <div className="review-rating-row">
                                {renderStars(review.rating)}
                              </div>
                              <h4 className="review-title">{review.title}</h4>
                              <p className="review-text">{review.text}</p>
                              <span className="review-date" style={{ display: 'block', marginTop: '8px' }}>Reviewed on {review.date}</span>
                            </div>
                            <div className="user-review-actions">
                              <div 
                                className="review-action-btn delete"
                                onClick={() => handleDeleteReview(review.id)}
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      {user && (
        <footer className="footer-wrapper">
        <div className="footer-container">
          <div className="footer-top">
            <div className="footer-brand">
              <h2>E-commerce</h2>
            </div>
            <div className="footer-column">
              <h3>Company</h3>
              <ul className="footer-links">
                <li><a href="#" onClick={(e) => {e.preventDefault(); alert("Products E-commerce Skripsi Project");}}>About Us</a></li>
                <li><a href="#" onClick={(e) => {e.preventDefault(); alert("Contact: agung@example.com");}}>Contact</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h3>Support</h3>
              <ul className="footer-links">
                <li><a href="#" onClick={(e) => {e.preventDefault(); triggerToast("Customer Service Ticket Created");}}>Customer Service</a></li>
                <li><a href="#" onClick={(e) => {e.preventDefault(); alert("We offer free 3-day delivery on all items.");}}>Shipping & Returns</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h3>Legal</h3>
              <ul className="footer-links">
                <li><a href="#" onClick={(e) => {e.preventDefault(); alert("Privacy Policy");}}>Privacy Policy</a></li>
                <li><a href="#" onClick={(e) => {e.preventDefault(); alert("Terms of Service");}}>Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} E-commerce. All rights reserved.</p>
          </div>
        </div>
      </footer>
      )}

    </div>
  );
}

export default App;
