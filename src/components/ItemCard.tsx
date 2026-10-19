"use client";

import Link from "next/link";
import { Package, MapPin } from "lucide-react";
import { Avatar } from "./Avatar";
import { FavoriteButton } from "./FavoriteButton";
import { SellerRating } from "./SellerRating";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { Item } from "@/types";

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function ItemCard({ item, appearance = "light" }: { item: Item; appearance?: "light" | "dark" }) {
  const dark = appearance === "dark";
  const seller = useUserProfile(item.userId, item.sellerName, item.sellerPhotoURL);
  const photo = item.photoURLs?.[0];
  const isNew =
    item.createdAt && Date.now() - item.createdAt.getTime() < NEW_WINDOW_MS;

  return (
    <div className={`${dark ? "card-dark" : "card"} group relative`}>
      <div className="absolute top-3 right-3 z-10">
        <FavoriteButton type="item" targetId={item.id} />
      </div>
      <Link href={`/items/${item.id}`} className="block">
        <div className={`relative h-48 overflow-hidden ${dark ? "bg-slate-800" : "bg-gradient-to-br from-brand-100 to-accent-100"}`}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={item.title}
              className="w-full h-full object-cover motion-safe:group-hover:scale-105 motion-safe:transition motion-safe:duration-300"
            />
          ) : (
            <div className={`w-full h-full flex flex-col items-center justify-center ${dark ? "text-emerald-400" : "text-brand-400"}`}>
              <Package size={40} aria-hidden="true" />
              <span className="text-xs mt-1 font-medium">No photo</span>
            </div>
          )}
          <span className={`absolute top-3 left-3 text-white font-bold text-sm px-3 py-1 rounded-full shadow ${dark ? "bg-emerald-700" : "bg-brand-600"}`}>
            ${Number(item.price).toFixed(2)}
          </span>
          {isNew && (
            <span className={`absolute top-3 left-24 text-xs font-bold px-2 py-1 rounded-full shadow ${dark ? "bg-amber-300 text-slate-950" : "bg-accent-600 text-white"}`}>
              NEW
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className={`font-bold truncate ${dark ? "text-white" : "text-gray-900"}`}>{item.title}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dark ? "bg-emerald-400/10 text-emerald-300" : "bg-accent-50 text-accent-700"}`}>
              {item.category}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${dark ? "bg-amber-400/10 text-amber-300" : "bg-brand-50 text-brand-700"}`}>
              {item.condition}
            </span>
          </div>
          <SellerRating sellerId={item.userId} className="seller-rating mt-2" />
          <div className={`flex items-center justify-between mt-3 text-sm ${dark ? "text-slate-300" : "text-gray-600"}`}>
            <span className="flex items-center gap-1 min-w-0">
              <MapPin size={14} aria-hidden="true" />
              <span className="truncate">{item.location || "Local"}</span>
            </span>
            <Avatar
              src={seller.photoURL}
              name={seller.name}
              size={24}
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
