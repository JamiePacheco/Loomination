import { useState } from "react";
import LoomisCanvas from "./components/LoomisCanvas";

import "./HomePage.css"

export default function HomePage() {
    
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string>("");
    
    const handleFileChange = (e : React.ChangeEvent<HTMLInputElement>) => {

        if (e === null || e.target === null || e.target.files === null) return;

        const selectedFile = e.target.files[0];
        setImage(selectedFile);
        setPreview(URL.createObjectURL(selectedFile));
    }

    return (
        <div>
            <div className = "home-page-content">
                <LoomisCanvas/>
            </div>
        </div>
    )
}