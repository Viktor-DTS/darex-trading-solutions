// Скрипт для виправлення bonusApprovalDate через консоль браузера
// Відкрийте https://darex-trading-solutions.onrender.com і виконайте цей код в консолі

async function fixBonusApprovalDates() {
    console.log('🚀 Початок виправлення bonusApprovalDate...');
    
    try {
        // Отримуємо всі заявки
        const response = await fetch('https://darex-trading-solutions.onrender.com/api/tasks');
        const tasks = await response.json();
        
        console.log(`📊 Знайдено ${tasks.length} заявок`);
        
        // Фільтруємо заявки без bonusApprovalDate
        const tasksWithoutBonusDate = tasks.filter(task => 
            !task.bonusApprovalDate || 
            task.bonusApprovalDate === '' || 
            task.bonusApprovalDate === null
        );
        
        console.log(`🔍 Знайдено ${tasksWithoutBonusDate.length} заявок без bonusApprovalDate`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Оновлюємо кожну заявку
        for (const task of tasksWithoutBonusDate) {
            // Перевіряємо чи заявка підтверджена всіма ролями
            const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true;
            const isAccountantApproved = task.approvedByAccountant === 'Підтверджено' || task.approvedByAccountant === true;
            const isRegionalManagerApproved = task.approvedByRegionalManager === 'Підтверджено' || task.approvedByRegionalManager === true;
            
            // Якщо заявка підтверджена всіма ролями, встановлюємо bonusApprovalDate
            if (isWarehouseApproved && isAccountantApproved && isRegionalManagerApproved && task.workPrice) {
                // Встановлюємо bonusApprovalDate на поточний місяць
                const now = new Date();
                const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
                const currentYear = now.getFullYear();
                const bonusApprovalDate = `${currentMonth}-${currentYear}`;
                
                try {
                    // Оновлюємо заявку
                    const updateResponse = await fetch(`https://darex-trading-solutions.onrender.com/api/tasks/${task._id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            ...task,
                            bonusApprovalDate: bonusApprovalDate
                        })
                    });
                    
                    if (updateResponse.ok) {
                        console.log(`✅ Оновлено заявку ${task._id}: bonusApprovalDate = ${bonusApprovalDate}`);
                        updatedCount++;
                    } else {
                        console.log(`❌ Помилка оновлення заявки ${task._id}`);
                        skippedCount++;
                    }
                } catch (error) {
                    console.log(`❌ Помилка оновлення заявки ${task._id}:`, error);
                    skippedCount++;
                }
            } else {
                console.log(`⏭️ Пропущено заявку ${task._id}: не підтверджена всіма ролями або немає workPrice`);
                skippedCount++;
            }
        }
        
        console.log(`\n📈 Результати:`);
        console.log(`✅ Оновлено: ${updatedCount} заявок`);
        console.log(`⏭️ Пропущено: ${skippedCount} заявок`);
        console.log(`📊 Всього оброблено: ${tasksWithoutBonusDate.length} заявок`);
        console.log(`\n🎉 Виправлення завершено! Тепер система може нараховувати премії.`);
        
        return {
            totalFound: tasksWithoutBonusDate.length,
            updated: updatedCount,
            skipped: skippedCount
        };
        
    } catch (error) {
        console.error('❌ Помилка при виправленні bonusApprovalDate:', error);
        throw error;
    }
}

// Запускаємо виправлення
console.log('🔧 Запуск скрипта виправлення bonusApprovalDate...');
console.log('📝 Виконайте: fixBonusApprovalDates()');
