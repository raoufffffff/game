import React, { useState, useRef, useEffect, useCallback } from 'react';

// دالة لمساعة تنسيق الوقت على شكل MM:SS
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// وظيفة رسم المربعات البسيطة لضمان استقرار الاقتصاص والرسم.
const drawSimpleSquarePath = (ctx, x, y, w, h) => {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.closePath();
};

const App = () => {
  // === حالة اللعبة ===
  const [imageUrl, setImageUrl] = useState(null);
  const [originalImageObj, setOriginalImageObj] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [isSolved, setIsSolved] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  // حالة الإحصائيات والتحدي
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [moves, setMoves] = useState(0);
  const [isPeeking, setIsPeeking] = useState(false);

  // حالة التفاعل مع اللمس/الماوس (تم التعديل لاستخدام ID)
  const [selectedPieceId, setSelectedPieceId] = useState(null); // استخدام ID القطعة
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // مراجع Canvas والإدخال
  const canvasRef = useRef(null);
  const uploadInputRef = useRef(null);
  const containerRef = useRef(null);

  const totalPieces = rows * cols;

  // === منطق المؤقت (Timer Logic) ===
  useEffect(() => {
    let interval = null;
    if (isRunning && !isSolved) {
      interval = setInterval(() => {
        setTime(prevTime => prevTime + 1);
      }, 1000);
    } else if (!isRunning && time !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning, isSolved, time]);

  // === وظائف التحميل والتحضير ===

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageUrl(e.target.result);
        setIsGameStarted(false);
        setPieces([]);
        setIsSolved(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // وظيفة تهيئة البازل وتقطيع الصورة (مستخدمة أيضًا لإعادة الحساب على تغيير الحجم)
  const initializePuzzle = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = containerRef.current;

    if (!container || !imageUrl) return;

    setIsLoading(true);
    // إذا لم تكن اللعبة قد بدأت من قبل، نعيد تعيين الوقت والحركات
    if (!isGameStarted) {
      setIsRunning(false);
      setTime(0);
      setMoves(0);
    }

    const img = originalImageObj || new Image();
    img.crossOrigin = "Anonymous";

    if (!originalImageObj) {
      await new Promise(resolve => {
        img.onload = resolve;
        img.src = imageUrl;
      });
      setOriginalImageObj(img);
    }

    const maxWidth = container.clientWidth;
    const maxHeight = window.innerHeight * 0.7;

    const imageRatio = img.width / img.height;
    let renderWidth = maxWidth;
    let renderHeight = renderWidth / imageRatio;

    if (renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = renderHeight * imageRatio;
    }

    // ضمان أن العرض والارتفاع مقسومين بالتساوي لتجنب الفجوات
    const fixedWidth = renderWidth - (renderWidth % cols);
    const fixedHeight = renderHeight - (renderHeight % rows);


    canvas.width = fixedWidth;
    canvas.height = fixedHeight;

    const pieceWidth = canvas.width / cols;
    const pieceHeight = canvas.height / rows;

    let initialPositions = [];
    if (pieces.length === 0) {
      // تهيئة القطع لأول مرة
      const piecePromises = [];
      for (let i = 0; i < totalPieces; i++) {
        const correctRow = Math.floor(i / cols);
        const correctCol = i % cols;
        const correctX = correctCol * pieceWidth;
        const correctY = correctRow * pieceHeight;

        const imgSourceWidth = img.width / cols;
        const imgSourceHeight = img.height / rows;

        // قطع صورة مربعة مؤقتة
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = pieceWidth;
        tempCanvas.height = pieceHeight;

        tempCtx.drawImage(
          img,
          correctCol * imgSourceWidth, correctRow * imgSourceHeight, // مصدر (Source)
          imgSourceWidth, imgSourceHeight,
          0, 0, // وجهة مؤقتة (Destination)
          pieceWidth, pieceHeight
        );

        const pieceDataUrl = tempCanvas.toDataURL();

        const loadPromise = new Promise((resolve) => {
          const pieceImg = new Image();
          pieceImg.src = pieceDataUrl;
          pieceImg.onload = () => {
            resolve({
              id: i, // المعرف الفريد للقطعة
              correctX: correctX,
              correctY: correctY,
              currentX: 0,
              currentY: 0,
              imageObj: pieceImg,
              width: pieceWidth,
              height: pieceHeight,
              correctPositionIndex: i,
              currentPositionIndex: i, // سيتغير عند الخلط
            });
          };
          pieceImg.onerror = () => resolve(null);
        });
        piecePromises.push(loadPromise);
        initialPositions.push(i);
      }

      const loadedPieces = (await Promise.all(piecePromises)).filter(p => p !== null);

      // الخلط
      let shuffledPositions = [...initialPositions].sort(() => Math.random() - 0.5);
      while (shuffledPositions.every((pos, index) => pos === index)) {
        shuffledPositions = shuffledPositions.sort(() => Math.random() - 0.5);
      }

      const finalPieces = loadedPieces.map((piece, index) => {
        const shuffledIndex = shuffledPositions[index];
        const newCol = shuffledIndex % cols;
        const newRow = Math.floor(shuffledIndex / cols);

        piece.currentX = newCol * pieceWidth;
        piece.currentY = newRow * pieceHeight;
        piece.currentPositionIndex = shuffledIndex;
        return piece;
      });

      setPieces(finalPieces);
      setIsGameStarted(true);
      setIsLoading(false);
      setIsRunning(true);
    } else {
      // تحديث أبعاد القطع الحالية وتمركزها عند تغيير حجم الشاشة أو إعادة الخلط
      // نستخدم نفس مؤشرات currentPositionIndex لكن نغير currentX/Y و width/height
      const updatedPieces = pieces.map(piece => {
        const currentPositionIndex = piece.currentPositionIndex;
        const newCol = currentPositionIndex % cols;
        const newRow = Math.floor(currentPositionIndex / cols);

        return {
          ...piece,
          width: pieceWidth,
          height: pieceHeight,
          currentX: newCol * pieceWidth,
          currentY: newRow * pieceHeight,
          correctX: (piece.correctPositionIndex % cols) * pieceWidth,
          correctY: Math.floor(piece.correctPositionIndex / cols) * pieceHeight,
        };
      });
      setPieces(updatedPieces);
      setIsGameStarted(true);
      setIsLoading(false);
      // لا نعيد تشغيل المؤقت هنا إذا كانت اللعبة قد بدأت، فقط نحدث الأبعاد
      if (isGameStarted) {
        setIsRunning(true);
      } else {
        // إذا كانت إعادة الخلط هي أول بدء، نبدأ المؤقت
        setIsRunning(true);
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);


  }, [imageUrl, rows, cols, totalPieces, originalImageObj, pieces, isGameStarted]);


  // === معالج تغيير حجم الشاشة (للاستجابة) ===
  useEffect(() => {
    const handleResize = () => {
      // إعادة التهيئة فقط إذا كانت اللعبة قد بدأت بالفعل لتحديث الأبعاد
      if (isGameStarted) {
        initializePuzzle();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isGameStarted, initializePuzzle]);

  // وظيفة الرسم: ترسم جميع القطع في مواقعها الحالية
  const drawPuzzle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || pieces.length === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // رسم الصورة الأصلية كخلفية شفافة عند المعاينة
    if (isPeeking && originalImageObj) {
      ctx.globalAlpha = 0.15;
      ctx.drawImage(originalImageObj, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }

    // لضمان سحب القطعة المختارة فوق باقي القطع
    const sortedPieces = [...pieces];
    if (selectedPieceId !== null) {
      const selectedIndex = sortedPieces.findIndex(p => p.id === selectedPieceId);
      if (selectedIndex !== -1) {
        const [selectedPiece] = sortedPieces.splice(selectedIndex, 1);
        sortedPieces.push(selectedPiece);
      }
    }

    sortedPieces.forEach((piece) => {
      const img = piece.imageObj;
      const { currentX, currentY, width, height } = piece;

      if (img) {
        // --- 1. الاقتصاص (Clipping) ---
        ctx.save();
        drawSimpleSquarePath(ctx, currentX, currentY, width, height); // استخدام الرسم المربع
        ctx.clip();

        // 2. رسم الصورة المقتطعة
        ctx.drawImage(img, currentX, currentY, width, height);
        ctx.restore();

        // --- 3. رسم الحدود (Stroke) ---
        ctx.save();
        drawSimpleSquarePath(ctx, currentX, currentY, width, height); // استخدام الرسم المربع

        ctx.strokeStyle = isSolved ? '#10b981' : '#fef08a'; // حدود صفراء فاتحة/خضراء
        // تم التحديث هنا: التحقق من ID القطعة لتحديد ما إذا كانت مسحوبة
        ctx.lineWidth = piece.id === selectedPieceId ? 3 : 1.5;
        ctx.stroke();

        ctx.restore();
      }
    });
  }, [pieces, isSolved, isPeeking, originalImageObj, selectedPieceId]);

  // دالة تحديث الرسم في كل مرة تتغير فيها حالة القطع أو المعاينة
  useEffect(() => {
    if (isGameStarted) {
      drawPuzzle();
    }
  }, [pieces, isPeeking, isSolved, drawPuzzle, isGameStarted]);

  // دالة التحقق من فوز اللاعب
  const checkWin = useCallback(() => {
    const solved = pieces.every(piece =>
      // نتحقق من انطباق القطعة على مكانها الصحيح
      piece.currentPositionIndex === piece.correctPositionIndex
    );
    if (solved && !isSolved) {
      setIsSolved(true);
      setIsRunning(false);
    }
  }, [pieces, isSolved]);

  // دالة تحويل إحداثيات الشاشة إلى مؤشر شبكة (Grid Index)
  const getGridIndexFromCoords = (x, y) => {
    const canvas = canvasRef.current;
    if (!canvas || pieces.length === 0) return -1;

    const pieceWidth = pieces[0].width;
    const pieceHeight = pieces[0].height;

    const col = Math.floor(x / pieceWidth);
    const row = Math.floor(y / pieceHeight);

    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      return row * cols + col;
    }
    return -1;
  }

  // دالة وضع القطعة في مكانها الصحيح في الشبكة (Snapping)
  // تستخدم الآن pieceIndex (فهرس المصفوفة) الذي يمرر من handleEnd
  const snapPiece = (pieceIndex, gridIndex) => {
    const newPieces = [...pieces];
    const piece = newPieces[pieceIndex];

    if (gridIndex === -1) return;

    const didMove = piece.currentPositionIndex !== gridIndex;

    const pieceWidth = piece.width;
    const pieceHeight = piece.height;
    const col = gridIndex % cols;
    const row = Math.floor(gridIndex / cols);

    const targetX = col * pieceWidth;
    const targetY = row * pieceHeight;

    // تبديل القطعة الموجودة في المكان الجديد (إن وجدت)
    const existingPieceIndex = newPieces.findIndex((p, idx) =>
      idx !== pieceIndex && p.currentPositionIndex === gridIndex
    );

    if (existingPieceIndex !== -1) {
      const existingPiece = newPieces[existingPieceIndex];
      const oldGridIndex = piece.currentPositionIndex;

      existingPiece.currentPositionIndex = oldGridIndex;
      const oldCol = oldGridIndex % cols;
      const oldRow = Math.floor(oldGridIndex / cols);
      existingPiece.currentX = oldCol * pieceWidth;
      existingPiece.currentY = oldRow * pieceHeight;
    }

    piece.currentX = targetX;
    piece.currentY = targetY;
    piece.currentPositionIndex = gridIndex;

    setPieces(newPieces);

    if (didMove) {
      setMoves(prev => prev + 1);
    }

    checkWin();
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // حساب الإحداثيات بالنسبة للوحة Canvas مع الأخذ في الاعتبار التحجيم
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    return { x, y };
  };

  // ==========================================================
  // FIX: استخدام ID القطعة وتعديل ترتيب المصفوفة
  // ==========================================================
  const handleStart = (e) => {
    if (isSolved || !isGameStarted || isPeeking) return;

    const { x, y } = getCanvasCoords(e);

    // البحث عن القطعة التي تم النقر عليها (من الأعلى إلى الأسفل في ترتيب الرسم)
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      // يتم التحقق من مربع الإحاطة (Bounding Box) لتحديد النقر
      if (x > piece.currentX && x < piece.currentX + piece.width &&
        y > piece.currentY && y < piece.currentY + piece.height) {

        setOffsetX(x - piece.currentX);
        setOffsetY(y - piece.currentY);

        // نقل القطعة المختارة إلى نهاية المصفوفة لضمان رسمها في الأعلى
        const newPieces = [...pieces];
        const [draggedPiece] = newPieces.splice(i, 1);
        newPieces.push(draggedPiece);

        setPieces(newPieces);
        setSelectedPieceId(draggedPiece.id); // نستخدم ID الآن
        return;
      }
    }
  };

  const handleMove = (e) => {
    if (selectedPieceId === null || isSolved || isPeeking) return; // تم التحديث

    const { x, y } = getCanvasCoords(e);
    const newPieces = [...pieces];

    // نجد الفهرس الحالي للقطعة المختارة باستخدام ID
    const selectedPieceIndex = newPieces.findIndex(p => p.id === selectedPieceId);

    if (selectedPieceIndex === -1) return;

    const piece = newPieces[selectedPieceIndex];

    piece.currentX = x - offsetX;
    piece.currentY = y - offsetY;

    setPieces(newPieces);
  };

  const handleEnd = (e) => {
    if (selectedPieceId === null || isSolved || isPeeking) return; // تم التحديث

    // نجد الفهرس الحالي للقطعة المختارة باستخدام ID قبل السحب
    const pieceIndex = pieces.findIndex(p => p.id === selectedPieceId);

    if (pieceIndex === -1) {
      setSelectedPieceId(null);
      return;
    }

    const piece = pieces[pieceIndex];

    // حساب مؤشر الشبكة بناءً على مركز القطعة
    const targetGridIndex = getGridIndexFromCoords(piece.currentX + piece.width / 2, piece.currentY + piece.height / 2);

    snapPiece(pieceIndex, targetGridIndex); // snapPiece يستخدم الفهرس

    setSelectedPieceId(null); // مسح ID القطعة
    setOffsetX(0);
    setOffsetY(0);
  };
  // ==========================================================
  // نهاية FIX
  // ==========================================================

  // === إضافة مستمعي الأحداث للوحة Canvas ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // الماوس
    canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    // اللمس (للاستجابة على الموبايل)
    canvas.addEventListener('touchstart', handleStart);
    canvas.addEventListener('touchmove', handleMove);
    canvas.addEventListener('touchend', handleEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      canvas.removeEventListener('touchend', handleEnd);
    };
  }, [handleStart, handleMove, handleEnd, isSolved, isPeeking]); // تم إزالة selectedPieceIndex من التبعيات


  // === واجهة المستخدم (JSX) ===
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 font-['Cairo']" dir="rtl">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
        body { font-family: 'Cairo', sans-serif; }
        .stat-card {
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
            animation: fadeIn 0.3s ease-out;
        }
        /* لتغطية عرض الـ div الحاوي في React Canvas */
        .canvas-container canvas {
            max-width: 100%;
            height: auto;
            display: block;
        }
      `}</style>

      <header className="w-full max-w-5xl text-center mb-6">
        <h1 className="text-4xl font-extrabold text-blue-700 mt-6 mb-2">
          لعبة بازل الصور التفاعلية
        </h1>
        <p className="text-gray-500">
          حوّل صورتك إلى تحدٍ جديد باستخدام القطع المربعة الكلاسيكية.
        </p>
      </header>

      <div className="w-full max-w-5xl bg-white p-6 rounded-xl shadow-2xl border border-gray-100 flex flex-col gap-6">

        {/* === لوحة الإحصائيات (Stats Panel) === */}
        {isGameStarted && (
          <div className="flex justify-around items-center bg-blue-50 p-4 rounded-xl stat-card text-center flex-wrap gap-4">

            {/* عداد الحركات */}
            <div className="flex flex-col items-center text-blue-800">
              <span className="text-3xl font-bold">{moves}</span>
              <span className="text-sm font-medium mt-1">حركة</span>
            </div>

            {/* المؤقت */}
            <div className="flex flex-col items-center text-blue-800 border-x border-blue-200 px-6">
              <span className="text-3xl font-bold">{formatTime(time)}</span>
              <span className="text-sm font-medium mt-1">الوقت</span>
            </div>

            {/* زر المعاينة */}
            <button
              onMouseDown={() => setIsPeeking(true)}
              onMouseUp={() => setIsPeeking(false)}
              onTouchStart={() => setIsPeeking(true)}
              onTouchEnd={() => setIsPeeking(false)}
              disabled={isSolved || !isRunning}
              className={`
                         py-2 px-4 rounded-lg font-semibold shadow-md transition duration-200 
                         ${isSolved || !isRunning ? 'bg-gray-300 text-gray-500 cursor-not-allowed' :
                  'bg-red-500 hover:bg-red-600 active:scale-95 text-white transform'}
                     `}
            >
              {isPeeking ? 'جارٍ المعاينة...' : 'معاينة (اضغط باستمرار)'}
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">

          {/* === لوحة التحكم === */}
          <div className="lg:w-1/3 w-full p-4 bg-gray-50 rounded-lg shadow-inner flex flex-col space-y-4">
            <h2 className="text-xl font-bold text-gray-700 border-b pb-2">إعدادات اللعبة</h2>

            {/* إدخال الصورة */}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => uploadInputRef.current.click()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg shadow-xl transition duration-200 transform hover:scale-[1.01]"
            >
              {imageUrl ? 'تغيير الصورة' : 'رفع صورة (PNG/JPG)'}
            </button>

            {/* اختيار الصعوبة */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">مستوى الصعوبة (الأبعاد)</label>
              <div className="flex justify-between space-x-2" dir="ltr">
                {[3, 4, 5].map((size) => (
                  <button
                    key={size}
                    onClick={() => { setRows(size); setCols(size); setIsGameStarted(false); setPieces([]); setIsSolved(false); setTime(0); setMoves(0); }}
                    className={`flex-1 py-2 rounded-lg font-semibold transition duration-150 ${size === rows
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'bg-white text-blue-600 border border-blue-300 hover:bg-blue-100'
                      }`}
                    disabled={isGameStarted || isLoading}
                  >
                    {size}x{size}
                  </button>
                ))}
              </div>
            </div>

            {/* زر بدء اللعبة */}
            {imageUrl && !isGameStarted && (
              <button
                onClick={initializePuzzle}
                disabled={isLoading}
                className={`w-full text-lg font-bold py-3 rounded-lg transition duration-300 transform shadow-xl
                             ${isLoading ? 'bg-green-400 cursor-wait' : 'bg-green-600 hover:bg-green-700 hover:scale-[1.01]'}
                             text-white
                         `}
              >
                {isLoading ? 'جاري التحضير...' : `بدء البازل (${rows}x${cols})`}
              </button>
            )}

            {/* زر إعادة الخلط */}
            {isGameStarted && (
              <button
                onClick={initializePuzzle}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 rounded-lg shadow-xl transition duration-200 transform hover:scale-[1.01]"
                disabled={isLoading}
              >
                إعادة خلط القطع
              </button>
            )}

            {/* حالة اللعبة */}
            {imageUrl && !isGameStarted && !isLoading && (
              <p className="text-center font-bold text-md mt-4 p-3 rounded-lg bg-indigo-100 text-indigo-700 border-2 border-indigo-500">
                اضبط الصعوبة واضغط "بدء البازل".
              </p>
            )}

            {/* معاينة الصورة (Placeholder) */}
            {!imageUrl && (
              <div className="mt-4 p-6 bg-gray-200 border-dashed border-2 border-gray-400 rounded-lg text-center text-gray-500">
                <p>الرجاء رفع صورة لبدء اللعبة.</p>
              </div>
            )}
          </div>

          {/* === منطقة البازل === */}
          <div ref={containerRef} className="lg:w-2/3 w-full flex justify-center items-center p-4 bg-gray-100 rounded-lg shadow-inner relative min-h-[300px] canvas-container">

            {imageUrl ? (
              <canvas
                ref={canvasRef}
                className={`rounded-lg transition duration-500 cursor-pointer max-w-full h-auto`}
              />
            ) : (
              <div className="text-gray-400 text-lg">لوحة البازل فارغة...</div>
            )}

            {/* رسالة عند الفوز */}
            {isSolved && (
              <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center rounded-lg backdrop-blur-sm p-4 animate-fadeIn">
                <div className="bg-white p-8 rounded-xl shadow-2xl text-center transform scale-100 transition duration-500">
                  <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <h2 className="text-3xl font-extrabold text-green-600 mb-2">تهانينا! فوز ساحق!</h2>
                  <p className="text-gray-700 mb-2">أكملت البازل في:</p>
                  <p className="text-4xl font-extrabold text-blue-600 mb-4">{formatTime(time)}</p>
                  <p className="text-gray-700 mb-6">بـ {moves} حركة.</p>

                  <button
                    onClick={initializePuzzle}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition duration-200 shadow-lg"
                  >
                    العب مرة أخرى (بخلط جديد)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default App;
