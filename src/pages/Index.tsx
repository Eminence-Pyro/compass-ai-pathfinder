import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { assessments } from '../data/assessments';
import { analyzeAssessment, generatePersonalizedPath, adaptLearningPath } from '../utils/aiRecommendations';
import { tracks } from '../data/tracks';
import { LearningPath, Achievement } from '../types/index';
import { toast } from 'sonner';
import { checkForNewAchievements } from '../utils/achievementEngine';
import { localStorageService } from '../services/localStorageService';

import TrackSelection from '../components/TrackSelection';
import Assessment from '../components/Assessment';
import LearningDashboard from '../components/LearningDashboard';
import AchievementNotification from '../components/AchievementNotification';
import Footer from '../components/Footer';

type AppState = 'track-selection' | 'assessment' | 'dashboard';

const Index = () => {
  const { user, loading, updateUser, logout } = useAuth();
  const [appState, setAppState] = useState<AppState>('track-selection');
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    if (!loading && user) {
      console.log('User state:', { track: user.track, assessmentCompleted: user.assessmentCompleted });
      
      if (!user.track || user.track === '') {
        console.log('Setting state to track-selection');
        setAppState('track-selection');
      } else if (!user.assessmentCompleted) {
        console.log('Setting state to assessment');
        setAppState('assessment');
      } else {
        console.log('Setting state to dashboard');
        setAppState('dashboard');
      }
    }
  }, [user, loading]);

  const handleTrackSelection = async (trackId: string) => {
    console.log('Track selected:', trackId);
    const selectedTrack = tracks.find(t => t.id === trackId);
    await updateUser({ 
      track: trackId,
    });
    toast.success(`${selectedTrack?.name} track selected!`);
    setAppState('assessment');
  };

  const handleAssessmentComplete = async (answers: number[]) => {
    console.log('Assessment completed with answers:', answers);
    
    const assessment = assessments.find(a => a.track === user?.track);
    if (!assessment || !user) return;

    // Analyze assessment results
    const result = analyzeAssessment(answers, assessment.questions);
    console.log('Assessment analysis:', result);

    // Generate personalized learning path
    const pathModules = generatePersonalizedPath(user, result, user.track);
    console.log('Generated path modules:', pathModules);

    const learningPath: LearningPath = {
      id: `path_${Date.now()}`,
      userId: user.id,
      track: user.track,
      modules: pathModules,
      progress: 0,
      adaptationHistory: [`Initial path generated based on ${result.skillLevel} level assessment`],
      createdAt: new Date().toISOString()
    };

    // Update user with assessment results and learning path
    const updatedUser = {
      assessmentCompleted: true,
      skillLevel: result.skillLevel,
      currentPath: learningPath,
      achievements: user.achievements || [],
      totalPoints: user.totalPoints || 0
    };

    await updateUser(updatedUser);

    // Check for achievements
    const achievements = checkForNewAchievements({ ...user, ...updatedUser }, user.completedModules);
    if (achievements.length > 0) {
      const userAchievements = [...(user.achievements || []), ...achievements];
      await updateUser({ 
        achievements: userAchievements,
        totalPoints: userAchievements.reduce((total, a) => total + a.points, 0)
      });
      setNewAchievements(achievements);
    }

    toast.success(`Personalized learning path generated! You're at ${result.skillLevel} level.`);
    setAppState('dashboard');
  };

  const handleModuleComplete = async (moduleId: string) => {
    if (!user) return;
    
    const previousCompletedModules = [...user.completedModules];
    const updatedCompletedModules = [...user.completedModules, moduleId];
    
    // Check for new achievements
    const tempUser = { ...user, completedModules: updatedCompletedModules };
    const achievements = checkForNewAchievements(tempUser, previousCompletedModules);
    
    const updatedUser: any = { completedModules: updatedCompletedModules };
    
    if (achievements.length > 0) {
      const userAchievements = [...(user.achievements || []), ...achievements];
      updatedUser.achievements = userAchievements;
      updatedUser.totalPoints = userAchievements.reduce((total, a) => total + a.points, 0);
      setNewAchievements(achievements);
    }
    
    await updateUser(updatedUser);
    
    const module = user.currentPath?.modules.find(m => m.id === moduleId);
    toast.success(`Module "${module?.title}" completed! 🎉`);
    
    console.log('Module completed:', moduleId);
  };

  const handleAdaptPath = async () => {
    if (!user || !user.currentPath) return;

    console.log('Adapting learning path...');
    const adaptedModules = adaptLearningPath(
      user.currentPath.modules,
      user.completedModules,
      user
    );

    const updatedPath: LearningPath = {
      ...user.currentPath,
      modules: adaptedModules,
      adaptationHistory: [
        ...user.currentPath.adaptationHistory,
        `Path adapted based on ${user.completedModules.length} completed modules`
      ]
    };

    await updateUser({ currentPath: updatedPath });
    toast.success('Learning path adapted based on your progress!');
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
  };

  const closeAchievementNotification = () => {
    setNewAchievements([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-orange-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading 3MTT Compass AI...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('No user found, should redirect to login');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-orange-50">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  console.log('Current app state:', appState);

  switch (appState) {
    case 'track-selection':
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">
            <TrackSelection onSelectTrack={handleTrackSelection} />
          </div>
          <Footer />
        </div>
      );
    
    case 'assessment':
      const assessment = assessments.find(a => a.track === user?.track);
      if (!assessment) {
        return (
          <div className="min-h-screen flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-red-600 mb-4">Assessment Not Found</h2>
                <p className="text-gray-600">No assessment available for the selected track.</p>
              </div>
            </div>
            <Footer />
          </div>
        );
      }
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">
            <Assessment assessment={assessment} onComplete={handleAssessmentComplete} />
          </div>
          <Footer />
        </div>
      );
    
    case 'dashboard':
      return (
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">
            <LearningDashboard 
              user={user}
              onModuleComplete={handleModuleComplete}
              onLogout={handleLogout}
              onAdaptPath={handleAdaptPath}
            />
          </div>
          
          {/* Achievement Notifications */}
          {newAchievements.length > 0 && (
            <AchievementNotification
              achievements={newAchievements}
              user={user}
              onClose={closeAchievementNotification}
            />
          )}
          <Footer />
        </div>
      );
    
    default:
      console.log('Default case reached, showing track selection');
      return null;
  }
};

export default Index;