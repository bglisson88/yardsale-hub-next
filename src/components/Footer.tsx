'use client';

export function Footer() {
  return (
    <footer className="bg-gradient-to-br from-accent-900 to-gray-900 text-gray-300 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white font-bold mb-4">YardSale Hub</h3>
            <p className="text-sm">Buy and sell items locally. Discover yard sales in your area.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Browse</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/items" className="hover:text-white transition">All Items</a></li>
              <li><a href="/events" className="hover:text-white transition">Yard Sales</a></li>
              <li><a href="/items" className="hover:text-white transition">Categories</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Selling</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/items/new" className="hover:text-white transition">Post an Item</a></li>
              <li><a href="/events/new" className="hover:text-white transition">Create Event</a></li>
              <li><a href="/dashboard" className="hover:text-white transition">My Dashboard</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Help</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Contact Us</a></li>
              <li><a href="#" className="hover:text-white transition">Safety</a></li>
              <li><a href="#" className="hover:text-white transition">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; 2026 YardSale Hub. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
