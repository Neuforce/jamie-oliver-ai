import React from 'react';
import { Search } from 'lucide-react';

export interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  onSearch?: (value: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

export function SearchInput(props: SearchInputProps) {
  const { 
    placeholder = "Search recipes by name, ingredie...", 
    onSearch,
    onChange,
    ...inputProps 
  } = props;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onSearch?.(e.target.value);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-black/10 rounded-[25px] transition-all duration-200 focus-within:border-[#46BEA8] focus-within:ring-2 focus-within:ring-[#46BEA8]/20">
        <input
          type="text"
          placeholder={placeholder}
          onChange={handleChange}
          className="flex-1 text-base leading-[21px] text-[#5d5d5d] placeholder:text-[#5d5d5d] bg-transparent outline-none font-['Work_Sans',sans-serif]"
          {...inputProps}
        />
        <Search className="size-6 text-[#327179] flex-shrink-0" strokeWidth={1.5} />
      </div>
    </div>
  );
}