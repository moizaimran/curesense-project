import React from 'react'

import { useState } from "react";
import { Search } from "lucide-react";

export default function SearchBar({search ,setSearch}) {

    

    return (

        <div className="relative w-96 group ml-8">
  <Search
    size={20}
    className="
      absolute
      left-4
      top-1/2
      -translate-y-1/2
      text-slate-400
      group-focus-within:text-blue-600
      transition-colors
      duration-300
      pointer-events-none
    "
  />

  <input
    type="text"
    placeholder="Search patient..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="
      w-full
      rounded-2xl
      border
      border-slate-200
      bg-white/80
      backdrop-blur-lg
      py-3
      pl-12
      pr-5
      text-sm
      text-slate-700
      placeholder:text-slate-400
      shadow-lg
      shadow-slate-200/60
      transition-all
      duration-300
      hover:border-blue-400
      hover:shadow-xl
      hover:shadow-blue-100/40
      focus:outline-none
      focus:border-blue-500
      focus:ring-4
      focus:ring-blue-100
    "
  />
</div>

    );

}