import { HeartPulse, ShieldCheck, Brain, Stethoscope } from "lucide-react";


const AuthLayout = ({ children }) => {

    return (

        <div className="min-h-screen flex bg-slate-50">


            {/* Left Branding Section */}

            <div 
                className="
                    hidden
                    lg:flex
                    w-1/2
                    relative
                    overflow-hidden
                    bg-linear-to-br
                    from-blue-700
                    via-blue-600
                    to-cyan-500
                    text-white
                    flex-col
                    justify-center
                    px-16
                "
            >


                {/* Background Circle Effects */}

                <div className="
                    absolute
                    -top-20
                    -left-20
                    w-72
                    h-72
                    bg-white/10
                    rounded-full
                "></div>


                <div className="
                    absolute
                    bottom-10
                    right-10
                    w-60
                    h-60
                    bg-white/10
                    rounded-full
                "></div>



                <div className="relative z-10">


                    {/* Logo */}

                    <div className="flex items-center gap-3 mb-8">


                        <div className="
                            bg-white
                            text-blue-600
                            p-3
                            rounded-2xl
                            shadow-lg
                        ">

                            <HeartPulse size={35}/>

                        </div>



                        <h1 className="
                            text-4xl
                            font-bold
                            tracking-wide
                        ">
                            CureSense
                        </h1>


                    </div>





                    <h2 className="
                        text-4xl
                        font-bold
                        leading-tight
                        max-w-lg
                    ">

                        Intelligent Healthcare.
                        Better Clinical Decisions.

                    </h2>



                    <p className="
                        mt-5
                        text-blue-100
                        text-lg
                        max-w-md
                    ">

                        AI-powered clinical decision support system
                        helping doctors provide faster and
                        evidence-based healthcare.

                    </p>




                    {/* Features */}

                    <div className="mt-10 space-y-5">


                        <div className="flex items-center gap-4">

                            <ShieldCheck 
                                className="text-white"
                                size={25}
                            />

                            <span>
                                Secure Patient Records
                            </span>

                        </div>



                        <div className="flex items-center gap-4">

                            <Brain 
                                size={25}
                            />

                            <span>
                                AI Assisted Diagnosis
                            </span>

                        </div>




                        <div className="flex items-center gap-4">

                            <Stethoscope 
                                size={25}
                            />

                            <span>
                                Doctor-Centered Healthcare
                            </span>

                        </div>


                    </div>


                </div>


            </div>






            {/* Right Form Section */}


            <div className="
                w-full
                lg:w-1/2
                flex
                items-center
                justify-center
                p-6
            ">



                <div className="
                    w-full
                    max-w-lg
                    bg-white
                    rounded-3xl
                    shadow-xl
                    border
                    border-gray-100
                    p-8
                ">


                    {/* Mobile Logo */}

                    <div className="
                        lg:hidden
                        flex
                        justify-center
                        items-center
                        gap-2
                        mb-6
                    ">


                        <HeartPulse
                            className="text-blue-600"
                        />


                        <h1 className="
                            text-2xl
                            font-bold
                            text-blue-600
                        ">
                            CureSense
                        </h1>


                    </div>



                    {children}


                </div>


            </div>


        </div>

    )

}


export default AuthLayout;