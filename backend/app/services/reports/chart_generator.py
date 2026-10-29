"""Chart Generator for Reports"""
import os
from typing import Dict
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import logging

logger = logging.getLogger(__name__)

class ChartGenerator:
    def __init__(self):
        self.charts_dir = "reports/charts"
        os.makedirs(self.charts_dir, exist_ok=True)
    
    def generate_score_chart(self, scores: Dict[str, int], filename: str) -> str:
        """Generate a bar chart for scores"""
        file_path = os.path.join(self.charts_dir, filename)
        
        fig, ax = plt.subplots(figsize=(10, 6))
        categories = list(scores.keys())
        values = list(scores.values())
        
        colors = ['#10B981' if v >= 75 else '#F59E0B' if v >= 50 else '#EF4444' for v in values]
        
        ax.barh(categories, values, color=colors)
        ax.set_xlabel('Score', fontsize=12, fontweight='bold')
        ax.set_xlim(0, 100)
        ax.set_title('Website Audit Scores', fontsize=14, fontweight='bold')
        ax.grid(axis='x', alpha=0.3)
        
        for i, v in enumerate(values):
            ax.text(v + 2, i, str(v), va='center', fontweight='bold')
        
        plt.tight_layout()
        plt.savefig(file_path, dpi=150, bbox_inches='tight')
        plt.close()
        
        return file_path
    
    def generate_radar_chart(self, scores: Dict[str, int], filename: str) -> str:
        """Generate a radar/spider chart for multi-dimensional scores"""
        file_path = os.path.join(self.charts_dir, filename)
        
        categories = list(scores.keys())
        values = list(scores.values())
        
        # Number of variables
        N = len(categories)
        angles = [n / float(N) * 2 * 3.14159 for n in range(N)]
        values += values[:1]  # Complete the circle
        angles += angles[:1]
        
        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(projection='polar'))
        ax.plot(angles, values, 'o-', linewidth=2, color='#3B82F6')
        ax.fill(angles, values, alpha=0.25, color='#3B82F6')
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, size=10)
        ax.set_ylim(0, 100)
        ax.set_title('Overall Performance Radar', size=14, fontweight='bold', pad=20)
        ax.grid(True)
        
        plt.tight_layout()
        plt.savefig(file_path, dpi=150, bbox_inches='tight')
        plt.close()
        
        return file_path
    
    def generate_pie_chart(self, data: Dict[str, int], filename: str, title: str) -> str:
        """Generate a pie chart"""
        file_path = os.path.join(self.charts_dir, filename)
        
        fig, ax = plt.subplots(figsize=(8, 8))
        labels = list(data.keys())
        sizes = list(data.values())
        colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
        
        ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90, colors=colors)
        ax.axis('equal')
        ax.set_title(title, fontsize=14, fontweight='bold')
        
        plt.tight_layout()
        plt.savefig(file_path, dpi=150, bbox_inches='tight')
        plt.close()
        
        return file_path
