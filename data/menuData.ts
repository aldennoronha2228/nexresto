import type { MenuItem } from '@/context/CartContext';

export const menuItems: MenuItem[] = [
    // Breakfast
    { id: '1', name: 'Classic Eggs Benedict', description: 'Poached eggs on English muffin with hollandaise sauce and Canadian bacon', price: 18.50, image: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=800&q=80', category: 'Breakfast' },
    { id: '2', name: 'Avocado Toast Deluxe', description: 'Smashed avocado on sourdough with poached egg, cherry tomatoes, and microgreens', price: 16.00, image: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800&q=80', category: 'Breakfast' },
    { id: '3', name: 'Pancake Stack', description: 'Fluffy buttermilk pancakes with maple syrup, fresh berries, and whipped cream', price: 14.00, image: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=800&q=80', category: 'Breakfast' },
    { id: '4', name: 'Continental Breakfast', description: 'Assorted pastries, fresh fruit, yogurt, and choice of coffee or tea', price: 12.00, image: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80', category: 'Breakfast' },
    // Appetizers
    { id: '5', name: 'Lobster Bisque', description: 'Creamy lobster soup with cognac, fresh herbs, and crème fraîche', price: 16.00, image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&q=80', category: 'Appetizers' },
    { id: '6', name: 'Burrata & Heirloom Tomatoes', description: 'Fresh burrata cheese with heirloom tomatoes, basil, and balsamic reduction', price: 18.00, image: 'https://images.unsplash.com/photo-1592861956120-e524fc739696?w=800&q=80', category: 'Appetizers' },
    { id: '7', name: 'Crispy Calamari', description: 'Lightly fried calamari with lemon aioli and marinara sauce', price: 15.00, image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80', category: 'Appetizers' },
    { id: '8', name: 'Charcuterie Board', description: 'Selection of cured meats, artisan cheeses, olives, and fig jam', price: 24.00, image: 'https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=800&q=80', category: 'Appetizers' },
    // Main Course
    { id: '9', name: 'Grilled Ribeye Steak', description: '12oz prime ribeye with truffle mashed potatoes and seasonal vegetables', price: 48.00, image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80', category: 'Main Course' },
    { id: '10', name: 'Pan-Seared Salmon', description: 'Atlantic salmon with lemon beurre blanc, asparagus, and wild rice', price: 36.00, image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80', category: 'Main Course' },
    { id: '11', name: 'Mushroom Risotto', description: 'Creamy arborio rice with wild mushrooms, parmesan, and truffle oil', price: 28.00, image: 'https://images.unsplash.com/photo-1476124369491-c4cc9b6c7f94?w=800&q=80', category: 'Main Course' },
    { id: '12', name: 'Roasted Duck Breast', description: 'Crispy duck breast with orange glaze, roasted root vegetables, and jus', price: 42.00, image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', category: 'Main Course' },
    { id: '13', name: 'Lobster Linguine', description: 'Fresh lobster tail with linguine in white wine sauce and cherry tomatoes', price: 44.00, image: 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=800&q=80', category: 'Main Course' },
    { id: '14', name: 'Lamb Chops', description: 'Herb-crusted lamb chops with rosemary jus and roasted potatoes', price: 46.00, image: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&q=80', category: 'Main Course' },
    // Desserts
    { id: '15', name: 'Crème Brûlée', description: 'Classic vanilla custard with caramelized sugar and fresh berries', price: 12.00, image: 'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=800&q=80', category: 'Desserts' },
    { id: '16', name: 'Chocolate Lava Cake', description: 'Warm chocolate cake with molten center, vanilla ice cream', price: 14.00, image: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=800&q=80', category: 'Desserts' },
    { id: '17', name: 'Tiramisu', description: 'Classic Italian dessert with espresso-soaked ladyfingers and mascarpone', price: 11.00, image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&q=80', category: 'Desserts' },
    { id: '18', name: 'Cheesecake', description: 'New York style cheesecake with berry compote', price: 13.00, image: 'https://images.unsplash.com/photo-1533134242443-d4e2e76b49b7?w=800&q=80', category: 'Desserts' },
    // Beverages
    { id: '19', name: 'Craft Cocktails', description: 'Selection of premium cocktails crafted by our mixologists', price: 15.00, image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80', category: 'Beverages' },
    { id: '20', name: 'Premium Wine Selection', description: 'Curated selection of red, white, and sparkling wines', price: 18.00, image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80', category: 'Beverages' },
    { id: '21', name: 'Fresh Juice Bar', description: 'Freshly squeezed orange, grapefruit, or green juice', price: 8.00, image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=80', category: 'Beverages' },
    { id: '22', name: 'Artisan Coffee', description: 'Espresso, cappuccino, latte, or specialty coffee drinks', price: 6.00, image: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80', category: 'Beverages' },
];

export const categories = ['All', 'Breakfast', 'Appetizers', 'Main Course', 'Desserts', 'Beverages'];
